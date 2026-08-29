import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppModule } from '../app.module';
import { ChildComponent } from '../child.component';
import { GrandTheftRenderer, getBiome, getTerrainHeight } from './grandtheft-renderer';
import { BloodPool, BloodSplat, CityMesh, DeadBody, Explosion, GrandtheftService, MuzzleFlash, OtherPlayerState, ParkedCar, Rocket, Tracer, TrafficLane, VendingMachine } from '../../services/grandtheft.service';
import { UserEventService } from '../../services/user-event.service';
import { TodoService } from '../../services/todo.service';
import { FileService } from '../../services/file.service';
const CHUNK_SIZE = 80;
const CAR_HEIGHT = 0.4;
const JUMP_GRAVITY = 18;
const CAR_MAX_HEALTH = 200;
// Cars start smoking at 35% of max health and can smoke for at most
// CAR_SMOKE_SECONDS per life; the budget re-arms when the car is repaired
// above the smoke threshold or a fresh car is entered.
const CAR_SMOKE_HEALTH = CAR_MAX_HEALTH * 0.35;
const CAR_SMOKE_SECONDS = 10;
// Repair mechanics: idle regen after being out of combat for a while, and a
// fast full restore while parked at a service station (gas-station building).
const CAR_REGEN_DELAY = 6;     // seconds without damage before idle regen
const CAR_REGEN_RATE = 12;     // HP/sec while out of combat
const REPAIR_SHOP_RANGE = 14;  // pull-up distance to a service station
const REPAIR_SHOP_RATE = 120;  // HP/sec while at a service station
const REPAIR_SHOP_COST_PER_HP = 5; // money charged per HP restored at a service station
const JUMP_MIN_DIST = 8;
// Stunt bonus thresholds: landing at or above this launch speed (ground car
// top speed is ~35) earns distance-scaled cash even without a record, capped
// well below the record reward so records stay the big prize.
const JUMP_BONUS_MIN_SPEED = 20;
const JUMP_BONUS_MAX = 500;
// Fixed jump ramps (ids must match the server's JumpRamps list). yaw follows
// the car-forward convention (sin yaw, cos yaw) so the lip points down the
// launch line. Every ramp sits OFF the street grid (well away from the road
// strips on the 80-unit grid lines) in flat, drivable open ground: the beach
// ramps launch toward the sea, and the farm/hill/mountain ramps are long
// backcountry runs on the eastern islands.
const JUMP_RAMPS = [
  { id: 1, name: 'Beachfront Blast', x: 40, z: 260, yaw: 0 },
  { id: 2, name: 'Harbor Hop', x: 265, z: 120, yaw: Math.PI / 2 },
  { id: 3, name: 'Boardwalk Boost', x: 840, z: 580, yaw: 0 },
  { id: 4, name: 'Country Mile', x: 1860, z: 540, yaw: 0 },
  { id: 5, name: 'Hill Country', x: 2020, z: 540, yaw: 0 },
  { id: 6, name: 'Mountain Mayhem', x: 3060, z: 700, yaw: 0 },
];
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
const GT_WORLD_STATE_KEY = 'gt_world_state_v1';
const GT_PLAYER_STATE_KEY = 'gt_player_state_v1';
const GARAGE_ENTRANCE_X = 120;
const GARAGE_ENTRANCE_Z = 52;
const GARAGE_INTERIOR_X = 120;
const GARAGE_INTERIOR_Z = 42;
const GARAGE_DETECT_RADIUS = 18;
const GARAGE_DOOR_OPEN_SPEED = 3;
const VENDING_MACHINE_INTERVAL = 10;
const VENDING_MACHINE_HEAL_DIST = 4;
const VENDING_MACHINE_OFFSET = 12;
// Grocery-store interiors: walk in through the front door, stick up the register.
const STORE_LOOK_RADIUS = 14;       // how close you must be to a supermarket to detect its door
const STORE_ENTER_DIST = 2.6;       // distance to the door point (outside) to enter
const STORE_EXIT_DIST = 3.4;        // distance to the door point (inside) to leave
const STORE_REGISTER_DIST = 4.5;    // distance to the register (store centre) to rob
const STORE_ROB_COOLDOWN_MS = 600000; // shared with the look-at supermarket robbery (10 min)
const STORE_INTERIOR_CAM_DIST = 2.2;  // tight camera so the view stays inside the building
const STORE_INTERIOR_CAM_HEIGHT = 1.6;
const WEAPON_DAMAGES = [10, 15, 25, 45, 100];
const PLAYER_POLL_FAST_MS = 200;
const PLAYER_POLL_SLOW_MS = 1000;
const ENTER_CAR_DIST = 4;
const HOOKER_SECLUDED_RADIUS = 7;
const HOOKER_HEAL_PER_SEC = 5;
const HOOKER_MONEY_PER_SEC = 1;
const HOOKER_MAX_MONEY = 80;
@Component({
  selector: 'app-grandtheft',
  templateUrl: './grandtheft.component.html',
  styleUrl: './grandtheft.component.css',
  standalone: true,
  imports: [AppModule, CommonModule, FormsModule],
})
export class GrandTheftComponent extends ChildComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('gtCanvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('gtMapCanvas', { static: false }) mapCanvasRef!: ElementRef<HTMLCanvasElement>;
  renderer!: GrandTheftRenderer;
  private animFrameId: number | null = null;
  private lastTime = 0;
  private keys: Set<string> = new Set();
  private _lastHudSpeed = -1;
  private _lastHealth = -1;
  carX = HOSPITAL_SPAWN_X;
  carY = CAR_HEIGHT;
  carZ = HOSPITAL_SPAWN_Z;
  carYaw = HOSPITAL_SPAWN_YAW;
  carVx = 0; carVz = 0; carVy = 0;
  carSpeed = 0;
  carAngleVel = 0;
  carPitch = 0;
  carRoll = 0;
  carHealth = 200;
  isInCar = false;
  vehicleType: 'car' | 'bus' | 'plane' | 'bike' | 'motorcycle' | 'taxi' | 'boat' | 'helicopter' | 'police' = 'car';
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
  private _chatClearTimer: any = null;
  private _trafficTimer = 0;
  private _pedTimer = 0;
  private _lookTargetTimer = 0;
  private _collisionTimer = 0;
  private _nearCarTimer = 0;
  camYaw = 0;
  camPitch = 0.2;
  camDist = 4;
  camHeight = 2;
  firstPerson = false;
  private isPointerLocked = false;
  serverNPCs: { id: number; x: number; y: number; z: number; yaw: number; type: string; mesh: CityMesh | CityMesh[]; health: number; colorR: number; colorG: number; colorB: number; remoteShootTimer?: number; prevX: number; prevZ: number; prevYaw: number; targetX: number; targetZ: number; targetYaw: number; speed: number; lastUpdate: number; gender?: string; hasDriver?: boolean; passengerCount?: number; isShootingAt?: boolean; isBurning?: boolean; isSmoking?: boolean; isFleeing?: boolean; isArresting?: boolean; meleeTargetId?: number; maxHealth?: number }[] = [];
  serverPedestrians: { id: number; x: number; z: number; yaw: number; gender: string; type?: string; mesh: CityMesh | CityMesh[]; health: number; prevX: number; prevZ: number; prevYaw: number; targetX: number; targetZ: number; targetYaw: number; speed: number; lastUpdate: number; isDucking?: boolean; isArresting?: boolean; isSwimming?: boolean; meleeTargetId?: number }[] = [];
  parkedCars: ParkedCar[] = [];
  // World persistence: throttled snapshot of player position + nearby local
  // parked cars so a refresh drops you back where you were, cars included.
  private _worldSaveTimer = 0;
  private onWorldSave = () => this.saveWorldState();
  trafficCars: { id: number; x: number; z: number; yaw: number; type: string; mesh: CityMesh | CityMesh[]; health: number; colorR: number; colorG: number; colorB: number; path: number[]; pathIdx: number; state: 'drive' | 'stop'; stopTimer: number; nextYaw: number; laneOffsetX: number; laneOffsetZ: number; hasDriver?: boolean; gender?: string; passengerCount?: number; speed: number; leadDist?: number; leadSpeed?: number; laneBias?: number; wanderPhase?: number; wanderFreq?: number; passing?: boolean; passTimer?: number; passCooldown?: number; passExtra?: number; blockTimer?: number }[] = [];
  private trafficNodes: { x: number; z: number }[] = [];
  private trafficEdges: [number, number][] = [];
  private trafficLanes: TrafficLane[] = [];
  private trafficNodeIdCounter = 10000;
  private trafficSpawnTimer = 0;
  localPedestrians: { id: number; x: number; z: number; yaw: number; gender: string; type?: string; mesh: CityMesh | CityMesh[]; health: number; targetX: number; targetZ: number; waitTimer: number; fightBackUntil?: number; punchTimer?: number; panicUntil?: number; panicFromX?: number; panicFromZ?: number; hookerStyle?: number; hookerGestureTimer?: number }[] = [];
  private pedSpawnTimer = 0;
  private populationScanTimer = 0;
  private readonly LOCAL_PED_CAP = 28;
  private readonly LOCAL_TRAFFIC_CAP = 30;
  private readonly PARKED_CAR_LIFETIME_SECONDS = 900;
  private pedIdCounter = 20000;
  // Occasional station cops: client-local ambience peds walking out of or into
  // a police-station door so stations feel lived-in between arrests.
  private stationCops: {
    id: number; type: string; gender: string;
    x: number; z: number; yaw: number;
    mesh: CityMesh | CityMesh[];
    health: number;
    targetX: number; targetZ: number;
    walkingIn: boolean;
    linger: number;
  }[] = [];
  private stationCopSpawnTimer = 0;
  private stationCopIdCounter = 40000;
  airportLotCars: { x: number; z: number; yaw: number; mesh: CityMesh | CityMesh[]; phase: number; dir: number; speed: number; p0: { x: number; z: number }; p1: { x: number; z: number } }[] = [];
  hudSpeed = 0;
  score = 0;
  private scoreTimer = 0;
  money = 1000;
  moneyStacks: { x: number; z: number; amount: number; yaw: number; age: number; lifetime: number }[] = [];
  // Short-lived impact reactions for pedestrians hit by the player's car.
  private npcImpactReactions: Map<number, { vx: number; vz: number; spin: number; age: number; duration: number }> = new Map();
  policeMode = false;
  policeRound = 0;
  policeModeThugCars: { id: number; x: number; z: number; yaw: number; mesh: CityMesh | CityMesh[]; health: number; maxHealth: number; speed: number; colorR: number; colorG: number; colorB: number; isSmoking?: boolean; smokeStarted?: number; smokeTimer?: number; isBurning?: boolean; fireStarted?: number; playerDamage?: number; killedByPlayer?: boolean }[] = [];
  policeModeThugPeds: { id: number; x: number; z: number; yaw: number; mesh: CityMesh | CityMesh[]; health: number; shootTimer: number }[] = [];
  // Cops ejected when the player commandeers a driven police car. They hunt the
  // thief — shooting if the player is armed, or charging to subdue/arrest if
  // unarmed. Empty for parked cruisers (nobody inside to evict).
  evictedCops: { id: number; x: number; z: number; yaw: number; mesh: CityMesh | CityMesh[]; health: number; targetX: number; targetZ: number; attackTimer: number; speed: number }[] = [];
  /** Transient guard so evicted-cop hostility is armed only once per police theft. */
  evictedCopId: number | undefined = undefined;
  policeModeSpawnTimer = 0;
  policeModeSpawnsRemaining = 0;
  policeModeRoundDelay = 0;
  policeModeKills = 0;
  private currentCarId = 0;
  dealershipNPCs: { id: number; x: number; z: number; yaw: number; mesh: CityMesh | CityMesh[]; lotGx: number; lotGz: number }[] = [];
  dealershipMission: { npcX: number; npcZ: number; state: 'search' | 'return'; payout: number; targetCarId: number; targetCarMesh: CityMesh | CityMesh[] } | null = null;
  dealershipMarkers: { type: 'hail' | 'destination' | 'beam'; x: number; z: number; phase?: number }[] = [];
  dealershipTargetCar: { id: number; x: number; z: number; yaw: number; mesh: CityMesh | CityMesh[]; health: number; colorR: number; colorG: number; colorB: number; type: string } | null = null;
  nearDealerNPC = false;
  private _wasDead = false;
  _carOnFire = false;
  _carFireStarted = 0;
  _carFireX = 0;
  _carFireZ = 0;
  _carFireYaw = 0;
  _carSubmerged = false;
  _carSubmergeStart = 0;
  _carSmoking = false;
  _carSmokeTimer = 0;
  _carSmokeStarted = 0;
  _carSmokeBudget = CAR_SMOKE_SECONDS;
  private _carLastDamageTime = 0;
  private _lastCarHealth = CAR_MAX_HEALTH;
  private _repairScanTimer = 0;
  repairShopNearby = false;
  repairHpCost = REPAIR_SHOP_COST_PER_HP;  // shown on the service-station hint
  repairRemainingCost = 0;                 // est. $ to fully repair (hint)
  repairOutOfCash = false;                 // hint state: parked but can't pay
  // Minimap gas-station icons, cached by movement so the wide 9×9-chunk scan
  // only reruns when the player actually travels.
  private _mapGasStations: { x: number; z: number }[] = [];
  private _mapGasCenterX = 0;
  private _mapGasCenterZ = 0;
  // Minimap police-station icons (where a busted player respawns), cached the
  // same way as the gas stations.
  private _mapPoliceStations: { x: number; z: number; yaw: number; hd: number }[] = [];
  private _mapPoliceCenterX = 0;
  private _mapPoliceCenterZ = 0;
  _parkedSmokeTimers: { [id: number]: number } = {};
  private _npcSmokeTimers: { [id: number]: number } = {};
  private _npcSmokeStarted: { [id: number]: number } = {};
  private _npcFleeTimers: { [id: number]: number } = {};
  private _npcFleeStarted: { [id: number]: number } = {};
  private _screechCtx: AudioContext | null = null;
  // Procedural car SFX: engine drone, crash thuds, and NPC-collision sounds.
  private _engineCtx: AudioContext | null = null;
  private _engineOsc: OscillatorNode | null = null;
  private _engineOsc2: OscillatorNode | null = null;
  private _engineFilter: BiquadFilterNode | null = null;
  private _engineGain: GainNode | null = null;
  private _engineLevel = 0;
  private _engineLoad = 0;
  private _lastEngineUpdate = 0;
  private _trafficCtx: AudioContext | null = null;
  private _trafficOsc: OscillatorNode | null = null;
  private _trafficOsc2: OscillatorNode | null = null;
  private _trafficFilter: BiquadFilterNode | null = null;
  private _trafficGain: GainNode | null = null;
  private _trafficPan: StereoPannerNode | null = null;
  private _trafficLevel = 0;
  private _crashCtx: AudioContext | null = null;
  private _punchCtx: AudioContext | null = null;
  private _lastPunchTime = 0;
  private _cashCtx: AudioContext | null = null;
  private _lastCashTime = 0;
  private _ricochetCtx: AudioContext | null = null;
  private _lastRicochetTime = 0;
  private _bustedCtx: AudioContext | null = null;
  private _wastedCtx: AudioContext | null = null;
  private _radioCtx: AudioContext | null = null;
  private _lastBrakeScreech = 0;
  private _lastCrashTime = 0;
  private _lastWallCrashTime = 0;
  private _lastTreeHitTime = 0;
  private _npcCrashCooldowns: Map<string, number> = new Map();
  private _lastScreechTime = 0;
  private _respawnTimer: any = null;
  private _justRespawned = false;
  // True once the server has returned its authoritative weapon/ammo state and we
  // adopted it. Until then we DON'T send our default fists array on the first
  // poll — otherwise a fresh page load would wipe DB-restored weapons before the
  // server response (carrying them) ever reaches us.
  private weaponsSynced = false;
  private _lastTrafficChunkX = 0;
  private _lastTrafficChunkZ = 0;
  isLoaded = false;
  loadingAssets = 0;
  // Remaining background assets still streaming in after the game started.
  deferredRemaining = 0;
  totalAssets = 0;
  showMap = false;
  showWeaponWheel = false;
  showLeaderboard = false;
  lbTab: 'live' | 'scores' | 'jumps' = 'live';
  hsSort: 'kills' | 'deaths' | 'money' | 'earned' | 'score' | 'escapes' | 'busted' | 'resists' | 'worstStreak' = 'score';
  highScores: any[] = [];
  hsTotal = 0;
  hsUserRank = 0;
  hsLoading = false;
  private _hsTimer: any = null;
  private _hsReqId = 0;
  // Jump ramps
  jumpActive = false;
  jumpRampId = 0;
  jumpLaunchX = 0;
  jumpLaunchZ = 0;
  jumpVy = 0;
  jumpPeak = 0;
  jumpAirtime = 0;
  jumpCooldown = 0;
  jumpReadout = '';
  jumpToast = '';
  jumpRampData: any[] = [];
  // Launch speed at ramp trigger — used to gate the non-record stunt bonus.
  jumpLaunchSpeed = 0;
  // Ramps whose once-per-session stunt bonus has already been claimed.
  // In-memory = one claim per ramp per page-load session, exactly the 'once
  // per ramp per session' rule the user asked for.
  jumpBonusClaimed: Set<number> = new Set();
  private _jumpToastTimer: any = null;
  // 🏆 NEW HIGH SCORE toasts — personal-best balance and kill milestones.
  trophyToast = '';
  private _trophyToastTimer: any = null;
  // ❌ Red 'Mission failed' toast shown on death while a mission was active.
  missionFailedToast = '';
  private _missionFailedToastTimer: any = null;
  // Last kill milestone toasted (1st kill, then every 10) so we never spam
  // the same milestone twice.
  private _lastTrophyKillMilestone = 0;
  // True once the first poll reported yourKills — that report only baselines
  // the persisted total so returning players don't get a toast for kills
  // earned in previous sessions.
  private _killsBaselineSet = false;
  otherPlayers: OtherPlayerState[] = [];
  tracers: Tracer[] = [];
  muzzleFlashes: MuzzleFlash[] = [];
  rockets: Rocket[] = [];
  explosions: Explosion[] = [];
  bloodSplats: BloodSplat[] = [];
  bloodPools: BloodPool[] = [];
  bulletSmoke: { x: number; y: number; z: number; vx: number; vy: number; vz: number; size: number; age: number; lifetime: number }[] = [];
  carSmoke: { x: number; y: number; z: number; vx: number; vy: number; vz: number; size: number; age: number; lifetime: number; colorR?: number; colorG?: number; colorB?: number }[] = [];
  deadBodies: DeadBody[] = [];
  deadNPCIds: Set<number> = new Set();
  stolenNpcIds: Set<number> = new Set();
  vendingMachines: VendingMachine[] = [];
  nearVendingMachine = false;
  // Grocery-store entry: outside the front door, at the register, or at the exit.
  nearStoreDoor = false;
  nearStoreRegister = false;
  nearStoreExit = false;
  inStore: { x: number; z: number; yaw: number; hd: number; doorX: number; doorZ: number; key: string } | null = null;
  private _nearStore: { x: number; z: number; yaw: number; hd: number; doorX: number; doorZ: number; key: string; isConvenience?: boolean } | null = null;
  // The grocery-store cashier: idles at the register, bolts for the door when
  // the register is stuck up. Client-local like localPedestrians.
  storeCashier: { id: number; x: number; z: number; yaw: number; gender: string; mesh: CityMesh | CityMesh[]; speed: number; panicUntil: number; doorX: number; doorZ: number } | null = null;
  storeToast = '';
  private _storeToastTimer: any = null;
  private _savedCamDist = 0;
  private _savedCamHeight = 0;
  private _storeLeaveUntil = 0;
  private _hudUpdateTimer = 0;
  taxiMission: { state: 'pickup' | 'deliver'; passengerId: number; passengerGender: string; passengerMesh: CityMesh | CityMesh[]; passengerX: number; passengerZ: number; destinationX: number; destinationZ: number; fare: number; phase: number; timer: number } | null = null;
  private taxiSearchTimer = 0;
  taxiMarkers: { type: 'hail' | 'destination' | 'beam'; x: number; z: number; phase?: number }[] = [];
  taxiMode = false;
  taxiSearchCountdown = 0;
  // Taxi passenger ride: pick a destination, a taxi drives in, you step out.
  nearTaxi = false;
  // Which half of the taxi the player is beside: front doors = steal, back doors = hail.
  taxiEntrySide: 'front' | 'back' | null = null;
  showTaxiDestinations = false;
  taxiDestinations: { name: string; icon: string; x: number; z: number; yaw: number }[] = [];
  taxiRideActive = false;
  taxiRidePhase: 'arriving' | 'stopped' | 'departing' = 'arriving';
  private taxiRideTimer = 0;
  private taxiRideTaxi: any = null;
  private taxiRideStartX = 0;
  private taxiRideStartZ = 0;
  private taxiRideStopX = 0;
  private taxiRideStopZ = 0;
  private taxiRideHidePlayer = false;
  taxiAttachedMeshes: { mesh: CityMesh | CityMesh[]; offsetX: number; offsetY: number; offsetZ: number; yaw: number; scale?: number }[] = [];
  // Refresh-resume grace: the player respawns on foot next to their vehicle, so
  // an on-foot taxi/police mission gets a few seconds to re-enter the car before
  // aborting (climbing into a *different* vehicle still ends it instantly).
  private _missionRestoreGrace = 0;
  // After a refresh the taxi passenger (a server ped) reappears with the first
  // poll — wait briefly for it before giving up on a restored fare.
  private _taxiReacquireGrace = 0;
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
  showPolicePrompt = false;
  isChatOpen = false;
  chatInput = '';
  pendingChatMessage = '';
  chatMessages: { userId: number; username: string; message: string; timestamp: string }[] = [];
  private knownChatTimestamps: Set<string> = new Set();
  private carRockPhase = 0;
  private hookerMoneyDrained = 0;
  private hookerPaymentRemainder = 0;
  carRocking = false;
  garageDoorOpenness = 0;
  garageCar: { vehicleType: string; colorR: number; colorG: number; colorB: number; yaw: number } | null = null;
  private garageCarMesh: CityMesh | CityMesh[] | null = null;
  private garagePollTimer = 0;
  private wasInGarage = false;
  private garageExitedCar = false;
  private garageStoreCooldown = 0;
  private _cachedSidewalkNodes: { x: number; z: number }[] = [];
  private isOpenOceanPosition(x: number, z: number): boolean {
    return getBiome(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)) === 'ocean';
  }

  private isBeachAdjacentWater(x: number, z: number): boolean {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    if (getBiome(cx, cz) !== 'ocean') return false;
    const localX = x - cx * CHUNK_SIZE;
    const localZ = z - cz * CHUNK_SIZE;
    const swimBand = 28;
    return (getBiome(cx - 1, cz) === 'beach' && localX <= swimBand)
      || (getBiome(cx + 1, cz) === 'beach' && localX >= CHUNK_SIZE - swimBand)
      || (getBiome(cx, cz - 1) === 'beach' && localZ <= swimBand)
      || (getBiome(cx, cz + 1) === 'beach' && localZ >= CHUNK_SIZE - swimBand);
  }

  private isGroundVehicleType(type: string): boolean {
    return type === 'car' || type === 'bus' || type === 'bike'
      || type === 'motorcycle' || type === 'taxi' || type === 'police'
      || type === 'traffic';
  }

  private _lastPedChunkX = 999;
  private _lastPedChunkZ = 999;
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
  private meleeAttack: 'punch' | 'kick' = 'punch';
  health = 100;
  wantedLevel = 0;
  lastShootTime = 0;
  isShooting = false;
  /** True while a cop is holding the player in an arrest — input is frozen. */
  private _arrested = false;
  showMenuPanel = false;
  sfxVolume = 1.0;
  carSfxVolume = 1.0;
  radioVolume = 1.0;
  viewDistance = 500;
  private _prewarmTimer: any = null;
  private uziSound: HTMLAudioElement | null = null;
  private rocketSound: HTMLAudioElement | null = null;
  private policeSirenSound: HTMLAudioElement | null = null;
  private audioUnlocked = false;
  private _pollTimer: any = null;
  private _pollInFlight = false;
  private _pollFailureCount = 0;
  private _frameInProgress = false;
  private _destroyed = false;
  private _renderFaulted = false;
  private _renderFaultCount = 0;
  private _renderRetryTimer: number | null = null;
  private _renderRetryPending = false;
  private _renderSchedulePending = false;
  private _lastRenderErrorTime = 0;
  private autoFireTimer: any = null;
  private _allNPCs: any[] = [];
  private _allPeds: any[] = [];
  weaponNames = WEAPON_NAMES;
  isMobile = false;
  damageAlpha = 0;
  vehicleName = '';
  vehicleBannerTimer = 0;
  wastedTimer = 0;
  murderFlashAlpha = 0;
  murderFlashTimer = 0;
  bustedFlashAlpha = 0;
  bustedTitleTimer = 0;
  bustCamTimer = 0;
  wantedPopTimer = 0;
  private crashShake = 0;
  private timeScale = 1;
  private slowMoTimer = 0;
  // Death-cam anchor: where the player died, so the camera can pan away into
  // the sky without following a drifting car/body.
  private _deathCamX = 0;
  private _deathCamZ = 0;
  // Bust release-pan anchor: the off-axis yaw the camera starts at when the
  // player is released at the station door, easing back behind them.
  private _bustCamStartYaw = 0;
  radioOn = false;
  radioSongs: string[] = [];
  altUpPressed = false;
  altDownPressed = false;
  // Procedural Web Audio for the helicopter rotor (spool-up on the ground,
  // silent in the air).
  private _heliCtx: AudioContext | null = null;
  private _heliOsc: OscillatorNode | null = null;
  private _heliOsc2: OscillatorNode | null = null;
  private _heliFilter: BiquadFilterNode | null = null;
  private _heliGain: GainNode | null = null;
  private _heliLfo: OscillatorNode | null = null;
  private _heliLfoGain: GainNode | null = null;
  private _heliSpool = 0;
  radioIndex = -1;
  radioSongTitle = '';
  private radioShouldPlay = false;
  private radioPlayerReady = false;
  private ytPlayer: any = null;
  private ytApiReady: Promise<void> | null = null;
  private joystickActive = false;
  private joystickId = -1;
  private joystickX = 0;
  private _lastSteerInput = 0;
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
  _lastPreGenX: number = 0;
  _lastPreGenZ: number = 0;
  constructor(private gtService: GrandtheftService,
    private userEventService: UserEventService,
    private todoService: TodoService,
    private fileService: FileService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef) { super(); }
  ngOnInit() {
    // Restore persisted money / wanted level / weapons before the first poll so
    // a refresh continues the session instead of resetting it.
    this.restorePlayerState();
    // Restore the settings sliders (view distance + volumes) so a reload keeps
    // the player's tuned experience; the values are read per-frame / on the
    // YouTube player's ready handler, so setting the fields here is enough.
    this.restoreGtSettings();
    this.userEventService.insertUserEvent(this.parentRef?.user?.id ?? 0, "grandtheft", "Started playing Grand Theft!", undefined, "GrandTheft");
  }

  /** View distance + volume sliders, persisted to localStorage under one key. */
  private readonly GT_SETTINGS_KEY = 'gt_settings';
  private restoreGtSettings(): void {
    try {
      const raw = localStorage.getItem(this.GT_SETTINGS_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s.sfxVolume === 'number') this.sfxVolume = Math.min(1, Math.max(0, s.sfxVolume));
      if (typeof s.carSfxVolume === 'number') this.carSfxVolume = Math.min(1, Math.max(0, s.carSfxVolume));
      if (typeof s.radioVolume === 'number') this.radioVolume = Math.min(1, Math.max(0, s.radioVolume));
      if (typeof s.viewDistance === 'number') this.viewDistance = Math.min(1000, Math.max(100, s.viewDistance));
    } catch { /* storage unavailable or corrupted — keep defaults */ }
  }
  saveGtSettings(): void {
    try {
      localStorage.setItem(this.GT_SETTINGS_KEY, JSON.stringify({
        sfxVolume: this.sfxVolume,
        carSfxVolume: this.carSfxVolume,
        radioVolume: this.radioVolume,
        viewDistance: this.viewDistance,
      }));
    } catch { /* storage full or unavailable */ }
  }
  ngAfterViewInit() {
    this.isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const canvas = this.canvasRef.nativeElement;
    if (this.isMobile) {
      canvas.width = Math.floor(window.innerWidth * 0.7);
      canvas.height = Math.floor(window.innerHeight * 0.7);
    } else {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    this.renderer = new GrandTheftRenderer(canvas);
    this.renderer.jumpRamps = JUMP_RAMPS;
    this.renderer.isMobile = this.isMobile;
    if (this.isMobile) this.renderer.reduceShadowMap();
    interface AssetTask { load: () => Promise<any>; critical?: boolean; }
    const tasks: AssetTask[] = [];
    const critical = (t: AssetTask) => { t.critical = true; return t; };
    tasks.push(critical({ load: async () => { this.renderer.initPlayerModel(); } }));
    tasks.push(critical({ load: () => this.renderer.loadGLTF('assets/grandtheft/citylight/scene.gltf').then(lamps => { if (lamps) this.renderer.lampMesh = lamps; }) }));
    tasks.push(critical({ load: () => this.renderer.loadGLTF('assets/grandtheft/skybox_skydays_3/scene.gltf', false).then(m => { if (m) this.renderer.skyboxMesh = m; }) }));
    const specialMeshes: { path: string; storeSkeleton: boolean; assign: (m: CityMesh[]) => void; scale?: number; yawOffset?: number }[] = [
      { path: 'assets/grandtheft/star_wars_luxury_yacht/scene.gltf', storeSkeleton: false, assign: m => this.renderer.boatMeshes.push(m), yawOffset: Math.PI },
      { path: 'assets/grandtheft/ultra-futuristic_luxury_yacht/scene.gltf', storeSkeleton: false, assign: m => this.renderer.boatMeshes.push(m) },
      { path: 'assets/grandtheft/cirrus_sr_22/scene.gltf', storeSkeleton: false, assign: m => this.renderer.planeMeshes.push(m), scale: 2.25 },
      { path: 'assets/grandtheft/low_poly_11_usaf_f22a_raptor/scene.gltf', storeSkeleton: false, assign: m => this.renderer.planeMeshes.push(m), scale: 2.25 },
      { path: 'assets/grandtheft/pizzaMoped/scene.gltf', storeSkeleton: false, assign: m => this.renderer.motorcycleMeshes.push(m) },
      { path: 'assets/grandtheft/crownVic/scene.gltf', storeSkeleton: false, assign: m => this.renderer.policeCarMesh = m },
      { path: 'assets/grandtheft/taxi/scene.gltf', storeSkeleton: false, assign: m => this.renderer.taxiMesh = m },
      { path: 'assets/grandtheft/hospital/scene.gltf', storeSkeleton: false, assign: m => this.renderer.hospitalMesh = m },
      { path: 'assets/grandtheft/japaneseShop/scene.gltf', storeSkeleton: false, assign: m => this.renderer.homeBaseMesh = m },
      { path: 'assets/grandtheft/vendingMachine/scene.gltf', storeSkeleton: false, assign: m => this.renderer.vendingMachineMesh = m },
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
      const yo = cfg.yawOffset;
      const isCore = cfg.path.includes('crownVic')
        || cfg.path.includes('taxi') || cfg.path.includes('hospital') || cfg.path.includes('japaneseShop');
      const t: AssetTask = { load: () => this.renderer.loadGLTF(cfg.path, cfg.storeSkeleton).then(mesh => { if (mesh) { cfg.assign(mesh); if (sc) for (const m of mesh) m.renderScale = sc; if (yo) for (const m of mesh) m.yawOffset = yo; } }) };
      if (isCore) critical(t);
      tasks.push(t);
    }
    const carConfigs = [
      { path: 'assets/grandtheft/lambo/scene.gltf', critical: true },
      { path: 'assets/grandtheft/2024_lamborghini_countach_lp5000_qv_lbworks/scene.gltf' },
      { path: 'assets/grandtheft/mitsubishi/scene.gltf' },
      { path: 'assets/grandtheft/hilux/scene.gltf' },
      { path: 'assets/grandtheft/suv/scene.gltf' },
      { path: 'assets/grandtheft/psxlow_poly_pickup/scene.gltf', yawOffset: Math.PI / 2 },
      { path: 'assets/grandtheft/vehicle_-_subaru_brz_rocket_bunny/scene.gltf' },
      { path: 'assets/grandtheft/1970_dodge_challenger_rt_lp/scene.gltf' },
      { path: 'assets/grandtheft/truck_toyota_corsa_b/scene.gltf', scale: 2, yawOffset: Math.PI },
      { path: 'assets/grandtheft/monsterTruck/scene.gltf', scale: 2.25 },
      { path: 'assets/grandtheft/jeep/scene.gltf', scale: 1.5 },
    ];
    for (const cfg of carConfigs) {
      const sc = cfg.scale;
      const yo = cfg.yawOffset;
      const t: AssetTask = { load: () => this.renderer.loadGLTF(cfg.path).then(car => { if (!car) return; if (sc) for (const m of car) m.renderScale = sc; if (yo) for (const m of car) m.yawOffset = yo; this.renderer.carMeshes.push(car); }) };
      if (cfg.critical) critical(t);
      tasks.push(t);
    }
    const m23Out: { animations?: any; skeleton?: any } = {};
    tasks.push(critical({ load: () => this.renderer.loadGLTF('assets/grandtheft/first_person_mark23/scene.gltf', false, m23Out).then(m => { if (m) { this.renderer.mark23Mesh = m; this.renderer.mark23Skeleton = m23Out.skeleton ?? null; this.renderer.mark23Animations = m23Out.animations ?? null; } }) }));
    // First-person arms are generated procedurally by the renderer. Do not load
    // the retired first_person_arms GLTF; the generated rig is what is animated
    // for unarmed punches and weapon viewmodels.
    this.renderer.ensureFirstPersonArms();
    // Building assets — tracked separately for cache clearing
    const buildingTasks: AssetTask[] = [];
    for (const name of GrandTheftRenderer.AIRPORT_BUILDING_NAMES) {
      buildingTasks.push({ load: () => this.renderer.loadGLTF(`assets/grandtheft/airport_buildings/${name}/scene.gltf`, false).then(m => { if (m) this.renderer.airportBuildingMeshes.push(m); }) });
    }
    const cityNames = this.isMobile ? GrandTheftRenderer.CITY_BUILDING_NAMES.slice(0, 8) : GrandTheftRenderer.CITY_BUILDING_NAMES;
    // First few city buildings are critical so the spawn area isn't a void;
    // the rest of the skyline streams in while you play.
    cityNames.forEach((name, cityIdx) => {
      const t: AssetTask = {
        load: () => this.renderer.loadGLTF(`assets/grandtheft/${name}/scene.gltf`, false).then(m => {
          if (m) {
            if (name === 'buildingRandom') {
              for (const mm of m) { mm.renderScale = 0.75; }
            }
            else if (
              name === "ichijoushi_002"
            ) {
              for (const mm of m) { mm.renderScale = 1.5; }
            }
            else if (
              name === "okraglak_round_office_building_poznan"
              || name === "low_poly_shopping_center"
              || name === "low_poly_cinema"
              || name === "low_poly_apartment_building_1"
              || name === "low_poly_apartment_building_3"
              || name === "brooklyn_street_building_low_poly"
              || name === "low_poly_apartment_building_2"
            ) {
              for (const mm of m) { mm.renderScale = 3; }
            }
            else if (name === 'abandoned_building_gameready') {
              for (const mm of m) { mm.renderScale = 5; }
            }
            this.renderer.cityBuildingMeshes.push(m);
          }
        })
      };
      if (cityIdx < 3) critical(t);
      buildingTasks.push(t);
    });
    const suburbNames = this.isMobile ? GrandTheftRenderer.SUBURB_BUILDING_NAMES.slice(0, 8) : GrandTheftRenderer.SUBURB_BUILDING_NAMES;
    for (const name of suburbNames) {
      buildingTasks.push({ load: () => this.renderer.loadGLTF(`assets/grandtheft/${name}/scene.gltf`, false).then(m => { if (m) this.renderer.suburbBuildingMeshes.push(m); }) });
    }
    const allTasks = [...tasks, ...buildingTasks];
    const criticalTasks = allTasks.filter(t => t.critical);
    const deferredTasks = allTasks.filter(t => !t.critical);
    this.totalAssets = criticalTasks.length;
    this.loadingAssets = this.totalAssets;
    const BATCH_SIZE = this.isMobile ? 1 : 6;
    let idx = 0;
    const processNextBatch = () => {
      const batch = criticalTasks.slice(idx, idx + BATCH_SIZE);
      if (batch.length === 0) {
        // Critical assets are in — start the game NOW.
        this.renderer.clearChunkCache();
        // Respawn at the saved spot (on foot, vehicle parked beside the player),
        // then rebuild any mission that was active when the world was saved.
        if (this.restoreWorldState()) this.restoreMissionState();
        this.isLoaded = true;
        this.loadingAssets = 0;
        this.deferredRemaining = deferredTasks.length;
        this.ngZone.runOutsideAngular(() => {
          this.lastTime = performance.now();
          this.startGameLoop();
        });
        // Stream the rest in the background so start time stays snappy.
        this.loadDeferredAssets(deferredTasks);
        return;
      }
      idx += batch.length;
      Promise.all(batch.map(t => t.load().catch(() => { }))).then(() => {
        this.loadingAssets = this.totalAssets - idx;
        if (this.isMobile) setTimeout(() => processNextBatch(), 150);
        else processNextBatch();
      });
    };
    processNextBatch();
    if (!this.isMobile) {
      canvas.addEventListener('click', this.onCanvasClick);
      document.addEventListener('pointerlockchange', this.onPointerLockChange);
    }
    window.addEventListener('resize', this.onResize);
    window.addEventListener('pagehide', this.onWorldSave);
    window.addEventListener('beforeunload', this.onWorldSave);
    this.initRadio();
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onInputBlur);
    document.addEventListener('visibilitychange', this.onInputVisibilityChange);
    if (!this.isMobile) document.addEventListener('wheel', this.onWeaponWheel, { passive: false });
    if (!this.isMobile) {
      document.addEventListener('mousemove', this.onMouseMove);
      canvas.addEventListener('mousedown', this.onMouseDown);
      canvas.addEventListener('mouseup', this.onMouseUp);
      canvas.addEventListener('mouseleave', this.onMouseLeave);
    }
    if (this.isMobile) {
      setTimeout(() => this.initTouchControls(canvas), 0);
    }
    this.ngZone.runOutsideAngular(() => {
      this.startPolling();
      // Start server NPC synchronization only after the first playable frame.
      // The polling loop is guarded and independent from rendering, so a
      // transient backend failure cannot freeze movement or the local population.
      setTimeout(() => {
        if (!this._destroyed && this.isLoaded) this.startNPCPolling();
      }, 1200);
    });
    // Build the initial local population only after the first playable frame is
    // ready. Calling initTraffic before the renderer has road nodes can leave
    // every initial car with an invalid route and the population then stays
    // empty after the first update tick.
    setTimeout(() => {
      if (!this._destroyed && this.isLoaded) this.initTraffic();
    }, 0);
    // Keep trying until streamed road geometry is available. A renderer cache
    // rebuild can finish after the first playable frame, so the initial no-node
    // attempt must not permanently leave the local population empty.
    const retryTraffic = () => {
      if (this._destroyed || !this.isLoaded || this.trafficCars.length > 0) return;
      this.initTraffic();
      if (this.trafficCars.length === 0) setTimeout(retryTraffic, 750);
    };
    setTimeout(retryTraffic, 750);
    setTimeout(() => this.trySpawnAirportLotCars(), 2000);
    setTimeout(() => this.trySpawnHospitalParkingCars(), 2500);
  }
  // Background asset streaming — runs after the critical assets let the game
  // start, filling in NPC variety, extra vehicles, special meshes and the rest
  // of the skyline while the player plays. Small batches + pacing so it never
  // stalls the frame; the chunk cache rebuilds lazily so new meshes appear.
  private loadDeferredAssets(deferredTasks: { load: () => Promise<any> }[]) {
    if (deferredTasks.length === 0) {
      this.deferredRemaining = 0;
      this.renderer.clearGltfCache(); // Clear memory!
      return;
    }
    const BATCH = this.isMobile ? 1 : 4;
    let idx = 0;
    const processNext = () => {
      if (this._destroyed) return;
      const batch = deferredTasks.slice(idx, idx + BATCH);
      if (batch.length === 0) {
        this.deferredRemaining = 0;
        // One rebuild at the end (not per batch) so streamed buildings/cars
        // appear without regenerating every visible chunk dozens of times
        // mid-game — far cheaper and no repeated pop-in.
        this.renderer.clearChunkCache();
        this.renderer.clearGltfCache(); // Clear memory!
        return;
      }
      idx += batch.length;
      Promise.all(batch.map(t => t.load().catch(() => { }))).then(() => {
        this.deferredRemaining = deferredTasks.length - idx;
        if (this.isMobile) setTimeout(processNext, 180);
        else setTimeout(processNext, 60);
      });
    };
    setTimeout(processNext, this.isMobile ? 300 : 100);
  }
  ngOnDestroy() {
    this._destroyed = true;
    this.stopHsRefresh();
    if (this._jumpToastTimer) { clearTimeout(this._jumpToastTimer); this._jumpToastTimer = null; }
    if (this._trophyToastTimer) { clearTimeout(this._trophyToastTimer); this._trophyToastTimer = null; }
    if (this._missionFailedToastTimer) { clearTimeout(this._missionFailedToastTimer); this._missionFailedToastTimer = null; }
    if (this.animFrameId !== null) cancelAnimationFrame(this.animFrameId);
    this.animFrameId = null;
    this._renderSchedulePending = false;
    if (this._renderRetryTimer !== null) { clearTimeout(this._renderRetryTimer); this._renderRetryTimer = null; }
    this._renderRetryPending = false;
    this._renderSchedulePending = false;
    const canvas = this.canvasRef.nativeElement;
    canvas.removeEventListener('click', this.onCanvasClick);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pagehide', this.onWorldSave);
    window.removeEventListener('beforeunload', this.onWorldSave);
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onInputBlur);
    document.removeEventListener('visibilitychange', this.onInputVisibilityChange);
    document.removeEventListener('wheel', this.onWeaponWheel);
    document.removeEventListener('mousemove', this.onMouseMove);
    canvas.removeEventListener('mousedown', this.onMouseDown);
    canvas.removeEventListener('mouseup', this.onMouseUp);
    canvas.removeEventListener('mouseleave', this.onMouseLeave);
    canvas.removeEventListener('touchstart', this.onCanvasTouchStart);
    canvas.removeEventListener('touchmove', this.onCanvasTouchMove);
    canvas.removeEventListener('touchend', this.onCanvasTouchEnd);
    document.removeEventListener('touchstart', this.onDocTouchStart);
    document.removeEventListener('touchmove', this.onDocTouchMove);
    document.removeEventListener('touchend', this.onDocTouchEnd);
    this.stopPolling();
    this.stopAutoFire();
    this.stopAllGrandTheftAudio();
    if (this._screechCtx) { try { this._screechCtx.close(); } catch { } this._screechCtx = null; }
    if (this._crashCtx) { try { this._crashCtx.close(); } catch { } this._crashCtx = null; }
    if (this._punchCtx) { try { this._punchCtx.close(); } catch { } this._punchCtx = null; }
    if (this._cashCtx) { try { this._cashCtx.close(); } catch { } this._cashCtx = null; }
    if (this._ricochetCtx) { try { this._ricochetCtx.close(); } catch { } this._ricochetCtx = null; }
    this._npcCrashCooldowns.clear();
    this.renderer?.clearCache();
    clearTimeout(this._chatClearTimer);
    this.remove_me("GrandTheftComponent")
  }
  selectNextWeapon() {
    this.selectWeaponByDirection(1);
  }
  private selectWeaponByDirection(direction: 1 | -1): void {
    for (let i = 1; i < this.weaponNames.length; i++) {
      const next = (this.currentWeapon + direction * i + this.weaponNames.length) % this.weaponNames.length;
      if (next === 0 || (this.ownedWeapons[next] && this.ammo[next] > 0)) {
        this.selectWeapon(next);
        return;
      }
    }
  }
  private onWeaponWheel = (e: WheelEvent) => {
    if (this.isMobile || this.showWeaponWheel || this.isChatOpen) return;
    e.preventDefault();
    this.selectWeaponByDirection(e.deltaY > 0 ? 1 : -1);
  };
  selectWeapon(idx: number) {
    // Drawing any weapon while cuffed is resisting arrest — the server aborts
    // the booking on its next poll, so drop the freeze immediately to let the
    // player fight back (the next poll confirms arrested=false).
    if (this._arrested && idx !== 0) this._arrested = false;
    this.currentWeapon = idx;
    this.showWeaponWheel = false;
  }
  private getJoystickCenter(): { x: number; y: number } {
    const joystickBase = document.getElementById('gt-joystick-base');
    if (joystickBase) {
      const rect = joystickBase.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
    }
    return {
      x: window.innerWidth / 4,
      y: window.innerHeight * 0.7
    };
  }
  private resetJoystick() {
    this.joystickX = 0;
    this.joystickY = 0;
    if (this.joystickThumbEl) {
      this.joystickThumbEl.style.transform = 'translate(-50%, -50%) translate(0px, 0px)';
    }
  }
  updateThumb = (x: number, y: number) => {
    const center = this.getJoystickCenter();
    const dx = x - center.x;
    const dy = y - center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const deadZone = 8;
    if (dist > 80) {
      this.joystickX = dx / dist;
      this.joystickY = -dy / dist;
    } else if (dist > deadZone) {
      this.joystickX = dx / 80;
      this.joystickY = -dy / 80;
    } else {
      this.resetJoystick();
      return;
    }
    if (this.joystickThumbEl) {
      const thumbOffset = Math.min(dist, 80);
      const tx = (dx / dist) * thumbOffset;
      const ty = (dy / dist) * thumbOffset;
      this.joystickThumbEl.style.transform = `translate(-50%, -50%) translate(${tx}px, ${ty}px)`;
    }
  };
  private initTouchControls(canvas: HTMLCanvasElement) {
    this.joystickThumbEl = document.getElementById('gt-joystick-thumb');
    canvas.addEventListener('touchstart', this.onCanvasTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.onCanvasTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.onCanvasTouchEnd, { passive: false });
    document.addEventListener('touchstart', this.onDocTouchStart, { passive: false });
    document.addEventListener('touchmove', this.onDocTouchMove, { passive: false });
    document.addEventListener('touchend', this.onDocTouchEnd, { passive: false });
  }
  mobileShoot() { this.unlockAudio(); this.isShooting = true; this.shoot(); this.startAutoFire(); }
  mobileShootEnd() { this.isShooting = false; this.stopAutoFire(); }
  onButtonTouch(e: TouchEvent) {
    e.preventDefault();
    e.stopPropagation();
  }
  toggleWeaponWheel() { this.showWeaponWheel = !this.showWeaponWheel; }
  toggleCar() {
    // Car entry is a user gesture, so use it to unlock browser audio before
    // starting the YouTube-backed radio.
    this.unlockAudio();
    // Inside a store: rob the register, or leave through the door.
    if (this.inStore) {
      if (this.nearStoreRegister) { this.robStore(); return; }
      if (this.nearStoreExit) { this.leaveStore(); return; }
      return;
    }
    if (this.nearStoreDoor && !this.isInCar && !this.isPassenger) {
      if (this._nearStore) { this.enterStore(this._nearStore); return; }
    }
    if (this.isPassenger) {
      this.exitPassenger();
      return;
    }
    if (this.isInCar) {
      if (!this.passenger && this.tryPickupPassenger()) {
        return;
      }
      this.exitCar();
    } else if (this.nearTaxi) {
      // Front doors (driver or passenger) let you steal the taxi and drive off;
      // the back doors put you inside as a passenger with a destination picker.
      if (this.taxiEntrySide === 'front') {
        const taxi = this.getNearbyTaxi();
        if (taxi) this.enterCar(taxi.id);
      } else {
        this.openTaxiDestinations();
      }
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
  toggleMap() {
    this.showMap = !this.showMap;
  }
  toggleView() {
    this.firstPerson = !this.firstPerson;
    if (this.firstPerson) {
      this.camDist = 0;
      this.camHeight = 0;
    } else if (this.isInCar) {
      this.setVehicleCameraProfile();
    } else {
      this.camDist = 4;
      this.camHeight = 2;
    }
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
      // Carry the amount paid during the ride so a later death can spill it.
      collectedMoney: this.hookerMoneyDrained,
    } as any);
    this.passenger = null;
    this.hookerMoneyDrained = 0;
    this.hookerPaymentRemainder = 0;
  }
  /** Nearest drivable taxi within reach (NPC or parked), or null. */
  private getNearbyTaxi(): { id: number; x: number; z: number; yaw: number } | null {
    let best: { id: number; x: number; z: number; yaw: number } | null = null;
    let bestDist = ENTER_CAR_DIST;
    for (const v of [...this.serverNPCs, ...this.parkedCars]) {
      if (v.type !== 'taxi' || v.health <= 0) continue;
      const d = Math.sqrt((v.x - this.carX) ** 2 + (v.z - this.carZ) ** 2);
      if (d < bestDist) { bestDist = d; best = { id: v.id, x: v.x, z: v.z, yaw: v.yaw }; }
    }
    return best;
  }
  private setVehicleCameraProfile() {
    if (this.firstPerson) {
      this.camDist = 0;
      this.camHeight = 0;
      return;
    }

    const vehicleName = Array.isArray(this.playerVehicleMesh)
      ? this.playerVehicleMesh.map(m => m.carName || '').join(' ').toLowerCase()
      : (this.playerVehicleMesh?.carName || '').toLowerCase();
    const isLargeTruck = this.vehicleType === 'bus'
      || vehicleName.includes('truck')
      || vehicleName.includes('monstertruck');

    if (isLargeTruck) {
      // Keep the cab/body from filling the lower half of the screen while
      // preserving a usable chase view on narrow mobile canvases.
      this.camDist = 10;
      this.camHeight = 4.5;
    } else if (this.vehicleType === 'plane') {
      this.camDist = 12; this.camHeight = 5;
    } else if (this.vehicleType === 'helicopter') {
      this.camDist = 10; this.camHeight = 4;
    } else if (this.vehicleType === 'boat') {
      this.camDist = 8; this.camHeight = 3;
    } else if (this.vehicleType === 'motorcycle') {
      this.camDist = 6; this.camHeight = 2.5;
    } else {
      this.camDist = 8; this.camHeight = 3;
    }
  }

  private enterCar(onlyId?: number) {
    const userId = this.getUserId();
    if (!userId) return;
    const tryEnter = (list: any[], isParked: boolean = false) => {
      for (const v of list) {
        if (v.health <= 0) continue;
        if (onlyId !== undefined && v.id !== onlyId) continue;
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
          this._carSmoking = false;
          this._carSmokeTimer = 0;
          this._carSmokeStarted = 0;
          this._carSmokeBudget = CAR_SMOKE_SECONDS;
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
          if (!this.radioOn) this.randomRadio();
          this.setVehicleCameraProfile();
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
          this.currentCarId = v.id;
          // Commandering a driven police car ejects its crew. Those cops come
          // straight after the thief: they shoot if the player is armed and
          // charge in to subdue/arrest if the player is unarmed. Parked cruisers
          // have nobody inside, so (per the design) they stay quiet.
          if (v.type === 'police' && !isParked) {
            this.evictedCopId = undefined; // re-arm the hostility below
            const crew = (v.passengerCount ?? 0) > 0 ? 3 : 2;
            const cx0 = v.x ?? this.carX, cz0 = v.z ?? this.carZ;
            const cyaw0 = v.yaw ?? this.carYaw;
            for (let k = 0; k < crew; k++) {
              const cid = --this.pedIdCounter;
              const ang = cyaw0 + (k === 0 ? Math.PI : Math.PI / 2 + k * 0.6);
              const dist = 1.6 + k * 0.35;
              const sx = cx0 + Math.sin(ang) * dist;
              const sz = cz0 + Math.cos(ang) * dist;
              this.evictedCops.push({
                id: cid, x: sx, z: sz, yaw: ang,
                mesh: this.renderer.getPedestrianMesh('cop', cid),
                health: 100,
                targetX: this.carX, targetZ: this.carZ,
                attackTimer: 0.8 + Math.random() * 0.6,
                speed: 3.2,
              });
            }
          }
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
            if (Math.sqrt(ddx * ddx + ddz * ddz) < this.aircraftEnterDist(da)) {
              this.carX = da.x; this.carZ = da.z; this.carYaw = da.yaw;
              this.camYaw = da.yaw;
              this.carVx = 0; this.carVz = 0; this.carSpeed = 0;
              this.isInCar = true;
              this.vehicleType = da.type as 'car' | 'bus' | 'plane' | 'bike' | 'motorcycle' | 'taxi' | 'boat' | 'helicopter' | 'police';
              this.carHealth = 200;
              this._carOnFire = false; this._carFireStarted = 0;
              this._carFireX = 0; this._carFireZ = 0; this._carFireYaw = 0;
              this._carSubmerged = false; this._carSubmergeStart = 0;
              this._carSmoking = false;
              this._carSmokeTimer = 0;
              this._carSmokeStarted = 0;
              this._carSmokeBudget = CAR_SMOKE_SECONDS;
              this.playerVehicleMesh = da.model || (da.type === 'helicopter' ? this.renderer.getHelicopterMesh(0, (da as any).isPolice === true) : this.renderer.getPlaneMesh(0));
              chunk.buildings = chunk.buildings.filter(b => Math.abs(b.x - da.x) > 0.1 || Math.abs(b.z - da.z) > 0.1);
              this.carY = da.type === 'helicopter' ? 5 : 3;
              this.carRoll = 0; this.carPitch = 0; this.carVy = 0;
              this.playerVehicleColor = [1, 1, 1];
              this.currentCarId = 0;
              if (this.renderer.playerMesh) {
                this.driverInCarMesh = { mesh: this.renderer.playerMesh, offsetX: 0.3, offsetY: -0.3, offsetZ: 0.2, yaw: 0, scale: 0.85 };
              }
              this.showVehicleBanner(this.vehicleType);
              if (!this.radioOn) this.randomRadio();
              this.setVehicleCameraProfile();
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
        this.carHealth = 200;
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
    // A taxi takes precedence — hail it instead of showing steal/enter prompts.
    this.showStealCarPrompt = (side === 'driver' && !this.nearTaxi);
    this.showEnterPassengerPrompt = (side === 'passenger' && !this.nearTaxi);
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
        this.stopHeliAudio();
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
        y: this.carY,
        type: this.vehicleType,
        health: this.carHealth,
        isBurning: this._carOnFire || undefined,
        isSmoking: this._carSmoking || undefined,
        smokeStarted: this._carSmoking ? this._carSmokeStarted : undefined,
        fireStarted: this._carOnFire ? this._carFireStarted : undefined,
        carFireX: this._carOnFire ? this._carFireX : undefined,
        carFireZ: this._carOnFire ? this._carFireZ : undefined,
        carFireYaw: this._carOnFire ? this._carFireYaw : undefined,
        submerged: this._carSubmerged || undefined,
        submergeStart: this._carSubmerged ? this._carSubmergeStart : undefined,
        mesh,
        colorR: color[0], colorG: color[1], colorB: color[2],
        parkedAt: performance.now() / 1000
      } as any);
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
    this._carSmoking = false;
    this._carSmokeTimer = 0;
    this._carSmokeStarted = 0;
    this._carSmokeBudget = CAR_SMOKE_SECONDS;
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
        this.garageExitedCar = true;
        this.isInCar = false; this.vehicleType = 'car';
        this.carVx = 0; this.carVz = 0; this.carSpeed = 0; this.carY = CAR_HEIGHT;
        this.camDist = 4; this.camHeight = 2;
        this.carX = GARAGE_ENTRANCE_X;
        this.carZ = GARAGE_ENTRANCE_Z + 3;
        this.stopRadio();
        this.stopHeliAudio();
        return;
      }
    }
    if (this.passenger) {
      this.dropPassenger(this.carX, this.carZ, this.carYaw);
    }
    const origCarX = this.carX, origCarZ = this.carZ;
    this.carX += Math.sin(angle) * exitDist;
    this.carZ += Math.cos(angle) * exitDist;
    this.carVx = 0; this.carVz = 0; this.carSpeed = 0;
    const exitTerrainY = getTerrainHeight(this.carX, this.carZ, this.carY, true);
    const exitRoofY = this.getBuildingRoofY(this.carX, this.carZ);
    const carRoofY = this.getBuildingRoofY(origCarX, origCarZ);
    const bestRoofY = exitRoofY > carRoofY ? exitRoofY : carRoofY;
    this.carY = CAR_HEIGHT + (bestRoofY > exitTerrainY ? bestRoofY : exitTerrainY);
    this.isInCar = false; this.vehicleType = 'car';
    this.stopHeliAudio();
    this.currentCarId = 0;
    this.camDist = 4; this.camHeight = 2;
    // Deliberately stepping out of the taxi mid-fare abandons the fare.
    if (this.taxiMission) this.abortTaxiFare();
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
    if (this.ytPlayer) {
      this.tryStartRadio();
      return;
    }
    this.ensureYtApi().then(() => {
      const div = document.getElementById('gt-yt-player');
      if (!div || this.ytPlayer) return;
      this.ytPlayer = new (window as any).YT.Player('gt-yt-player', {
        height: '0', width: '0',
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          enablejsapi: 1,
          fs: 0,
          modestbranding: 1,
          origin: window.location.origin,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            this.radioPlayerReady = true;
            try {
              const iframe = this.ytPlayer?.getIframe?.() as HTMLIFrameElement | undefined;
              iframe?.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
            } catch { }
            this.setRadioVolume();
            this.tryStartRadio();
          },
          onStateChange: (e: any) => {
            if (e.data === 1) {
              if (this.audioUnlocked) this.ytPlayer?.unMute?.();
              this.ngZone.run(() => {
                this.radioSongTitle = this.ytPlayer?.getVideoData?.()?.title || '';
              });
            }
            if (e.data === 0 && this.radioOn) this.nextRadio();
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
    this.radioShouldPlay = true;
    if (!this.radioSongs.length) return;
    this.radioIndex = (index + this.radioSongs.length) % this.radioSongs.length;
    this.tryStartRadio();
  }
  private tryStartRadio() {
    if (!this.isInCar || !this.radioShouldPlay || !this.radioSongs.length
      || !this.ytPlayer || !this.radioPlayerReady) return;
    if (this.radioIndex < 0) {
      this.radioIndex = Math.floor(Math.random() * this.radioSongs.length);
    }
    const id = this.radioSongs[this.radioIndex];
    if (!id) return;
    try {
      this.ytPlayer.loadVideoById(id);
      // Muted autoplay is allowed by browsers. Car entry calls unlockAudio()
      // from the user gesture, so unmute immediately when that permission exists.
      if (this.audioUnlocked) this.ytPlayer.unMute?.();
      else this.ytPlayer.mute?.();
      this.ytPlayer.playVideo?.();
      this.radioOn = true;
      this.setRadioVolume();
      this.ngZone.run(() => {
        this.radioSongTitle = this.ytPlayer?.getVideoData?.()?.title || '';
      });
    } catch { }
  }
  setRadioVolume() {
    if (!this.ytPlayer || typeof this.ytPlayer.setVolume !== 'function') return;
    try {
      this.ytPlayer.setVolume(Math.round(this.radioVolume * 100));
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
    this.radioShouldPlay = true;
    if (!this.radioSongs.length) return;
    if (this.radioOn && this.ytPlayer) try { this.ytPlayer.stopVideo(); } catch { }
    this.playRadio(Math.floor(Math.random() * this.radioSongs.length));
  }
  stopRadio() {
    this.radioShouldPlay = false;
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
  private startPolling() {
    this.stopPolling();
    this.scheduleMultiplayerPoll(0);
  }
  private stopPolling() {
    if (this._pollTimer) {
      clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }
  }
  private scheduleMultiplayerPoll(delay: number): void {
    if (this._destroyed) return;
    this._pollTimer = window.setTimeout(() => {
      this._pollTimer = null;
      void this.pollMultiplayer();
    }, delay);
  }    // Server NPC synchronization is intentionally disabled. Local traffic and
    // pedestrians keep the world populated without putting the render loop behind
    // the unstable NPC endpoint.
    private startNPCPolling() {
    if (this._destroyed || this._npcPollingDisabled || this._npcPollTimer) return;
    const generation = ++this._npcPollGeneration;
    const tick = () => {
      if (this._destroyed || this._npcPollingDisabled || generation !== this._npcPollGeneration) return;
      this._npcPollTimer = window.setTimeout(async () => {
        this._npcPollTimer = null;
        try {
          await this.pollNPCs();
        } catch (error) {
          // NPC sync is optional; keep local traffic/pedestrians playable.
          console.error('Grand Theft NPC polling failed:', error);
        } finally {
          tick();
        }
      }, 1000);
    };
    tick();
  }
  private stopNPCPolling() {
    ++this._npcPollGeneration;
    if (this._npcPollTimer) { clearTimeout(this._npcPollTimer); this._npcPollTimer = null; }
  }
  private _npcPollInFlight = false;
  private _npcPollTimer: any = null;
  private _npcPollGeneration = 0;
  private _npcPollFailures = 0;
  private _npcPollingDisabled = false;
  private async pollNPCs(): Promise<void> {
    if (this._destroyed || this._npcPollingDisabled || this._npcPollInFlight) return;
    this._npcPollInFlight = true;
    try {
      const data = await this.gtService.getNPCs(1, this.carX, this.carZ, this.getUserId());
      if (!data) return;
      // The server owns authoritative NPC simulation; retain local traffic and
      // pedestrians when the endpoint is unavailable, but replace server data
      // atomically whenever a valid response arrives.
      this.serverNPCs = data.cars.concat(data.aircraft ?? []).map((c: any) => ({
        ...c,
        id: c.id,
        x: c.posX, y: c.posY ?? 0, z: c.posZ,
        yaw: c.yaw ?? 0,
        type: c.type ?? 'car',
        mesh: this.getServerVehicleMesh(c),
        health: c.health ?? 100,
        colorR: c.colorR ?? 0.5, colorG: c.colorG ?? 0.5, colorB: c.colorB ?? 0.5,
        prevX: c.posX, prevZ: c.posZ, prevYaw: c.yaw ?? 0,
        targetX: c.posX, targetZ: c.posZ, targetYaw: c.yaw ?? 0,
        speed: c.speed ?? 0, lastUpdate: performance.now(),
      }));
      this.serverPedestrians = data.pedestrians.map((p: any) => ({
        ...p,
        x: p.posX, z: p.posZ, yaw: p.yaw ?? 0,
        gender: p.gender ?? 'male',
        mesh: this.renderer.getPedestrianMesh(p.gender ?? 'male', p.id),
        health: p.health ?? 100,
        prevX: p.posX, prevZ: p.posZ, prevYaw: p.yaw ?? 0,
        targetX: p.posX, targetZ: p.posZ, targetYaw: p.yaw ?? 0,
        speed: p.speed ?? 0, lastUpdate: performance.now(),
      }));
    } finally {
      this._npcPollInFlight = false;
    }
  }

  private getServerVehicleMesh(vehicle: any): CityMesh | CityMesh[] {
    const color: [number, number, number] = [vehicle.colorR ?? 0.5, vehicle.colorG ?? 0.5, vehicle.colorB ?? 0.5];
    switch (vehicle.type) {
      case 'police': return this.renderer.getPoliceCarMesh();
      case 'taxi': return this.renderer.getTaxiMesh();
      case 'bus': return this.renderer.busMesh || this.renderer.getNPCCarMesh(color, vehicle.id);
      case 'motorcycle': return this.renderer.getMotorcycleMesh(color, vehicle.id);
      case 'boat': return this.renderer.getBoatMesh(vehicle.id);
      case 'helicopter': return this.renderer.getHelicopterMesh(vehicle.id, !!vehicle.isPolice);
      case 'plane': return this.renderer.getPlaneMesh(vehicle.id);
      default: return this.renderer.getNPCCarMesh(color, vehicle.id);
    }
  }
  private async pollNPCsCore(): Promise<void> {
    // Kept only for compatibility with old callers. Server NPC sync is disabled
    // until its production endpoint is healthy; local population remains active.
    return;
    /*
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
    }      const allVehicles = [...data.cars, ...(data.aircraft || [])];
    this.serverNPCs = allVehicles
      .filter(c => !this.deadNPCIds.has(c.id) && !this.stolenNpcIds.has(c.id))
      .filter(c => !(this.isGroundVehicleType(c.type || 'car') && this.isOpenOceanPosition(c.posX, c.posZ)))
      .map(c => {
        const serverHp = c.health ?? 100;
        const localHp = prevCarHealth.get(c.id);
        const health = localHp !== undefined ? Math.min(localHp, serverHp) : serverHp;
        let mesh;
        if (c.type === 'cop') {
          mesh = this.renderer.getPedestrianMesh('cop', c.id);
        } else if (c.type === 'police') {
          mesh = this.renderer.getPoliceCarMesh();
        } else if (c.type === 'motorcycle') {
          mesh = this.renderer.getMotorcycleMesh([c.colorR, c.colorG, c.colorB], c.id);
        } else if (c.type === 'bus') {
          mesh = this.renderer.busMesh || this.renderer.getNPCCarMesh([c.colorR, c.colorG, c.colorB], c.id);
        } else if (c.type === 'taxi') {
          mesh = this.renderer.getTaxiMesh();
        } else if (c.type === 'helicopter') {
          mesh = this.renderer.getHelicopterMesh(c.id, (c as any).isPolice === true || (c as any).isCop === true);
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
          // Preserve the server's pursuit flags on every poll. A transiently
          // missing field must not turn an active cop into an ambient NPC.
          isShootingAt: c.isShootingAt === true,
          isArresting: c.isArresting === true,
          meleeTargetId: c.targetNpcId || 0,
          isBurning: c.isBurning || false,
          isSmoking: c.isSmoking || false,
          isFleeing: c.isFleeing || false,
          maxHealth: c.maxHealth || 200,
          ...interp
        };
      });
    // Prune per-car smoke throttle/anchor timers once a car leaves the world or stops smoking
    for (const k of Object.keys(this._npcSmokeTimers)) {
      const kid = Number(k);
      if (!this.serverNPCs.some(v => v.id === kid && v.isSmoking)) {
        delete (this._npcSmokeTimers as any)[k];
        delete (this._npcSmokeStarted as any)[k];
      }
    }
    // Same pruning for the flee-effect anchors — a car destroyed, despawned or
    // stolen mid-flee never hits the game-loop delete, so clear it here.
    for (const k of Object.keys(this._npcFleeTimers)) {
      const kid = Number(k);
      if (!this.serverNPCs.some(v => v.id === kid && v.isFleeing)) {
        delete (this._npcFleeTimers as any)[k];
        delete (this._npcFleeStarted as any)[k];
      }
    }
    this.serverPedestrians = data.pedestrians
      .filter(p => !this.deadNPCIds.has(p.id))
      .filter(p => !this.isOpenOceanPosition(p.posX, p.posZ) || this.isBeachAdjacentWater(p.posX, p.posZ))
      .map(p => {
        const serverHp = p.health ?? 50;
        const localHp = prevPedHealth.get(p.id);
        const health = localHp !== undefined ? Math.min(localHp, serverHp) : serverHp;
        let mesh;
        if (p.type === 'cop') {
          mesh = this.renderer.getPedestrianMesh('cop', p.id);
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
          isSwimming: !!p.isSwimming || this.isBeachAdjacentWater(p.posX, p.posZ),
          health,
          mesh,
          isShootingAt: p.isShootingAt === true,
          isDucking: p.isDucking === true,
          isArresting: p.isArresting === true,
          meleeTargetId: p.targetNpcId || 0,
          ...interp
        };
      });
    if (recentlyEvictedPeds.length > 0) {
      this.serverPedestrians = [
        ...this.serverPedestrians,
        ...recentlyEvictedPeds
          .filter(p => !this.isOpenOceanPosition(p.x, p.z) || this.isBeachAdjacentWater(p.x, p.z))
          .map(p => ({ ...p, isSwimming: this.isBeachAdjacentWater(p.x, p.z) }))
      ];
    }
    const serverParked = data.parkedCars.filter((pc: any) =>
      pc.type === 'boat' || !this.isOpenOceanPosition(pc.posX, pc.posZ)
    );
    const serverParkedIds = new Set(serverParked.map(p => p.id));
    // Local parked cars (negative ids) survive the merge — plus the dealership
    // heist target, so it stays enterable until the player grabs it.
    const localOnlyParked = this.parkedCars.filter(p =>
      !serverParkedIds.has(p.id) &&
      (p.id < 0 || (this.dealershipMission && p.id === this.dealershipMission.targetCarId)) &&
      (p.type === 'boat' || !this.isOpenOceanPosition(p.x, p.z)));
    this.parkedCars = [...serverParked
      .filter(pc => !this.stolenNpcIds.has(pc.id))
      .map(pc => {
        const existing = this.parkedCars.find(p => p.id === pc.id);
        const serverHp = pc.health ?? 100;
        const localHp = existing?.health ?? prevParkedHealth.get(pc.id);
        const health = localHp !== undefined ? Math.min(localHp, serverHp) : serverHp;
        if (existing) {
          existing.x = pc.posX; existing.z = pc.posZ; existing.yaw = pc.yaw; existing.health = health; existing.isBurning = pc.isBurning || false;
          existing.isSmoking = pc.isSmoking || false;
          existing.maxHealth = pc.maxHealth || 200;
          // "Recent fires" timer: anchor the burn start once so the client's
          // 10s burn-out timer actually runs for server-synced parked cars.
          if (existing.isBurning && !existing.fireStarted) existing.fireStarted = performance.now() / 1000;
          if (!existing.isBurning) existing.fireStarted = undefined;
          // "Recent smokes" timer: anchor smoke start once so the parked-car
          // 10s emission cap below can stop the particles.
          if (existing.isSmoking && !existing.smokeStarted) existing.smokeStarted = performance.now() / 1000;
          if (!existing.isSmoking) existing.smokeStarted = undefined;
          return existing;
        }
        let parkedMesh: CityMesh | CityMesh[];
        if (pc.type === 'motorcycle') parkedMesh = this.renderer.getMotorcycleMesh([pc.colorR, pc.colorG, pc.colorB], pc.id);
        else if (pc.type === 'taxi') parkedMesh = this.renderer.getTaxiMesh();
        else if (pc.type === 'police') parkedMesh = this.renderer.getPoliceCarMesh();
        else if (pc.type === 'bus') parkedMesh = this.renderer.busMesh || this.renderer.getNPCCarMesh([pc.colorR, pc.colorG, pc.colorB], pc.id);
        else if (pc.type === 'helicopter') parkedMesh = this.renderer.getHelicopterMesh(pc.id, (pc as any).isPolice === true);
        else if (pc.type === 'plane') parkedMesh = this.renderer.getPlaneMesh(pc.id);
        else if (pc.type === 'boat') parkedMesh = this.renderer.getBoatMesh(pc.id);
        else parkedMesh = this.renderer.getNPCCarMesh([pc.colorR, pc.colorG, pc.colorB], pc.id);
        return {
          id: pc.id, x: pc.posX, z: pc.posZ, yaw: pc.yaw,
          type: pc.type || 'car', health,
          isBurning: pc.isBurning || false,
          isSmoking: pc.isSmoking || false,
          maxHealth: pc.maxHealth || 200,
          fireStarted: pc.isBurning ? performance.now() / 1000 : undefined,
          smokeStarted: pc.isSmoking ? performance.now() / 1000 : undefined,
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
          mesh = this.renderer.getPedestrianMesh('cop', db.id);
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
    */
  }
  private startAutoFire() { this.stopAutoFire(); this.autoFireTimer = setInterval(() => this.shoot(), 50); }
  private stopAutoFire() { this.isShooting = false; if (this.autoFireTimer) { clearInterval(this.autoFireTimer); this.autoFireTimer = null; } }
  getUserId(): number { return (this.parentRef as any)?.user?.id ?? 0; }
  private async pollMultiplayer(): Promise<void> {
    if (this._destroyed || this._pollInFlight) return;
    this._pollInFlight = true;
    try {
      const userId = this.getUserId();
      if (!userId) {
        this.scheduleMultiplayerPoll(PLAYER_POLL_SLOW_MS);
        return;
      }
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
      chatMsg,
      this._justRespawned,
      this.weaponsSynced ? this.ownedWeapons : undefined,
      this.weaponsSynced ? this.ammo : undefined,
      this.wantedLevel
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
    // Arrest: while a cop holds the player the server pins the position and we
    // freeze input. The server always reports `arrested`, so a false value
    // means the hold ended — either the booking (arrestRespawn) or a resist
    // (arrestResisted, when the player drew a weapon or attacked mid-hold).
    if (res && res.arrested !== undefined) {
      this._arrested = res.arrested;
      if (res.arrested) {
        if (this.isInCar) this.exitCar();
        if (this.isPassenger) this.exitPassenger();
        this.carVx = 0; this.carVz = 0; this.carSpeed = 0;
      }
    }
    if (res && res.arrestRespawn) {
      this.doArrestRespawn();
    }
    if (res && res.arrestResisted) {
      this.wantedPopTimer = 0.8;
      this.showStoreToast('🚨 RESISTING ARREST! Wanted level increased');
    }
    if (res && res.arrestRegrabbed) {
      this.wantedPopTimer = 0.8;
      this.showStoreToast('🚨 THE COPS AREN\'T DONE WITH YOU — re-arrest attempt!');
    }
    if (res && res.lethalForce) {
      this.wantedPopTimer = 0.8;
      this.showStoreToast('☠️ LETHAL FORCE — the cops have stopped trying to arrest you!');
    }
    if (res && res.droppedWeapons) {
      this.droppedWeapons = res.droppedWeapons;
    }
    // Don't let a stale server response (polled before it processed our respawn)
    // re-grant the weapons we were stripped of — local state is already fists.
    if (res && res.ownedWeapons && !this._justRespawned) {
      this.ownedWeapons = res.ownedWeapons;
      this.ammo = res.ammo;
      this.weaponsSynced = true;
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
        this._chatClearTimer = window.setTimeout(() => {
          this.chatMessages = this.chatMessages.filter(x => x.timestamp != msg.timestamp);
        }, 30000);
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
        let nearestShotDist = Infinity;
        let shotX = 0, shotZ = 0;
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
              weapon: 2, age: 0, lifetime: 0.08
            });
            this.spawnBulletSmoke(npc.x, 1.2, npc.z, dx / d3, dy / d3, dz / d3, 1);
            this.spawnBulletTrail(npc.x, 1.2, npc.z, dx / d3, dy / d3, dz / d3, 1);
            foundShooter = true;
            // Volume follows the nearest shooter so a nearby cop's shots dominate.
            if (dist < nearestShotDist) {
              nearestShotDist = dist;
              shotX = npc.x; shotZ = npc.z;
            }
          }
        };
        for (const npc of this.serverNPCs) checkShooter(npc);
        for (const ped of this.serverPedestrians) checkShooter(ped);
        // NPC gunfire uses the rifle shot (weapon 2); weapon 0 is Unarmed and silent.
        if (foundShooter) this.playWeaponSound(2, this.getShotVolumeScale(shotX, shotZ));
      }
      // Ignore stale server health (0) right after local respawn to avoid re-death
      if (!this._justRespawned || res.yourHealth > 0) {
        this.health = res.yourHealth;
      }
    }
    if (res && res.wantedLevel !== undefined) {
      this.wantedLevel = res.wantedLevel;
    }
    if (res && res.yourMoney !== undefined) {
      this.money = res.yourMoney;
    }
    // Persist the authoritative state right away so a refresh mid-session keeps
    // money / wanted / weapons (≤1s staleness on the poll cadence).
    if (res) this.savePlayerState();
    // 🏆 NEW HIGH SCORE toasts: the server reports a new all-time balance
    // peak (newMoneyRecord) and the running kill total; toast on records and
    // kill milestones without spamming.
    if (res) {
      const trophyMsgs: string[] = [];
      if (res.newMoneyRecord && res.yourMoney !== undefined) {
        trophyMsgs.push(`🏆 NEW MONEY RECORD! $${res.yourMoney}`);
      }
      if (res.yourKills !== undefined) {
        const k = res.yourKills;
        if (!this._killsBaselineSet) {
          // First report just baselines the persisted kill total so previous
          // sessions' kills never celebrate on page load.
          this._killsBaselineSet = true;
          this._lastTrophyKillMilestone = k >= 10 ? Math.floor(k / 10) * 10 : k >= 1 ? 1 : 0;
        } else {
          const milestone = k >= 1 && k < 10 ? 1 : k >= 10 ? Math.floor(k / 10) * 10 : 0;
          if (milestone > 0 && milestone !== this._lastTrophyKillMilestone) {
            this._lastTrophyKillMilestone = milestone;
            trophyMsgs.push(`🏆 NEW KILL RECORD! ${k} kills`);
          }
        }
      }
      if (trophyMsgs.length > 0) {
        // Both can fire on the same poll (a kill reward that crosses the
        // balance peak) — show them stacked in one toast instead of the second
        // overwriting the first.
        this.showTrophyToast(trophyMsgs.join('\n'));
      }
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
      this._pollFailureCount = 0;
      this.scheduleMultiplayerPoll(this.otherPlayers.length > 0 ? PLAYER_POLL_FAST_MS : PLAYER_POLL_SLOW_MS);
    } catch (error) {
      this._pollFailureCount++;
      // A failed heartbeat must never stop the local game or create a retry
      // recursion. Back off briefly and let the next request start cleanly.
      if (this._pollFailureCount <= 3) {
        this.scheduleMultiplayerPoll(Math.min(4000, 1000 * this._pollFailureCount));
      }
    } finally {
      this._pollInFlight = false;
    }
  }
  private shoot() {
    if (this._arrested) return; // cuffed — can't fight back mid-arrest
    const now = performance.now();
    const firedWeapon = this.currentWeapon;
    if (now - this.lastShootTime < WEAPON_COOLDOWNS[firedWeapon]) return;
    if (firedWeapon !== 0) {
      if (this.ammo[firedWeapon] <= 0) return;
      this.ammo[firedWeapon]--;
      if (this.ammo[firedWeapon] <= 0) {
        this.ownedWeapons[firedWeapon] = false;
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
    if (firedWeapon === 0) {
      this.meleeAttack = this.meleeAttack === 'punch' ? 'kick' : 'punch';
      this.punchTimer = 0.38;
      if (this.renderer) {
        this.renderer.playerAttack = this.meleeAttack;
        this.renderer.playerFireTime = 0;
      }
      this.checkBulletHit(originX, originY, originZ, dirX, dirY, dirZ, 3);
    } else {
      if (this.renderer) {
        this.renderer.playerFireWeapon = firedWeapon;
        this.renderer.playerFireTime = 0.14;
      }
      if (firedWeapon === 4) {
        this.rockets.push({ x: originX, y: originY, z: originZ, vx: dirX * 40, vy: dirY * 40, vz: dirZ * 40, age: 0, lifetime: 3 });
      } else {
        const tracerLifetime = firedWeapon === 2 ? 0.15 : 0.3;
        this.tracers.push({ originX, originY, originZ, dirX, dirY, dirZ, age: 0, lifetime: tracerLifetime });
        this.muzzleFlashes.push({ x: originX, y: originY, z: originZ, dirX, dirY, dirZ, weapon: firedWeapon, age: 0, lifetime: 0.08 });
        if (firedWeapon === 3) {
          for (let i = 1; i < 8; i++) {
            const spread = 0.08;
            const sx = dirX + (Math.random() - 0.5) * spread;
            const sy = dirY + (Math.random() - 0.5) * spread;
            const sz = dirZ + (Math.random() - 0.5) * spread;
            this.tracers.push({ originX, originY, originZ, dirX: sx, dirY: sy, dirZ: sz, age: 0, lifetime: 0.2 });
          }
        }
      }
    }
    this.spawnBulletSmoke(originX, originY, originZ, dirX, dirY, dirZ, firedWeapon);
    this.spawnBulletTrail(originX, originY, originZ, dirX, dirY, dirZ, firedWeapon);
    this.checkBulletHit(originX, originY, originZ, dirX, dirY, dirZ, firedWeapon === 0 ? 3 : 50);
    this.playWeaponSound(firedWeapon);
  }
  private unlockAudio() {
    if (this.audioUnlocked) {
      // Shooting is also a user gesture, but must never restart an already
      // playing station. Only start the radio here when it is not currently on.
      if (!this.radioOn) this.tryStartRadio();
      return;
    }
    this.audioUnlocked = true;
    try {
      if (!this.uziSound) this.uziSound = new Audio('assets/grandtheft/uzi.mp3');
      if (!this.rocketSound) this.rocketSound = new Audio('assets/grandtheft/rocket.mp3');
      if (!this.policeSirenSound) { this.policeSirenSound = new Audio('assets/grandtheft/policeSiren.mp3'); this.policeSirenSound.loop = true; }
      [this.uziSound, this.rocketSound, this.policeSirenSound].forEach(a => {
        if (a) { a.volume = 0; a.play().then(() => { a.pause(); a.currentTime = 0; a.volume = 0.3; }).catch(() => { }); }
      });
      this.tryStartRadio();
    } catch (e) { }
  }
  /** Fade gunfire with distance: full volume up close, faint past ~60 units. */
  private getShotVolumeScale(x: number, z: number): number {
    const dist = Math.hypot(x - this.carX, z - this.carZ);
    return Math.max(0.1, 1 - dist / 60);
  }
  private playWeaponSound(weapon: number, volumeScale: number = 1) {
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
      clone.volume = vol * this.sfxVolume * volumeScale;
      clone.play().catch(() => { });
    } catch (e) { }
  }
  // Short procedural tire-screech: white noise through a bandpass swept from
  // ~1600Hz down to ~650Hz with a fast attack and ~0.6s decay — no audio asset
  // needed. Throttled by the caller so a fleeing car doesn't spam it.
  private playTireScreech() {
    if (this.carSfxVolume <= 0 || !this.isInCar) return;
    try {
      if (!this._screechCtx) {
        this._screechCtx = new AudioContext();
        if (this._screechCtx.state === 'suspended') { try { this._screechCtx.resume(); } catch { } }
      }
      const ctx = this._screechCtx;
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch { } }
      const dur = 0.6;
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(1600, ctx.currentTime);
      bp.frequency.exponentialRampToValueAtTime(650, ctx.currentTime + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.35 * this.carSfxVolume, ctx.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      src.connect(bp); bp.connect(g); g.connect(ctx.destination);
      src.start();
      src.stop(ctx.currentTime + dur);
    } catch (e) { }
  }
  // ---- Car engine audio (procedural Web Audio) ----
  // A sawtooth + sub-octave square through a lowpass. RPM climbs with throttle
  // and speed, the filter opens under load, and the level idles softly, rises
  // with speed, and fades to silence when you're not driving. Motorcycles run a
  // higher pitch band.
  private initEngineAudio() {
    if (this._engineCtx) return;
    try {
      const ctx = new AudioContext();
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch { } }
      this._engineCtx = ctx;
      this._engineFilter = ctx.createBiquadFilter();
      this._engineFilter.type = 'lowpass';
      this._engineFilter.frequency.value = 300;
      this._engineFilter.Q.value = 1.2;
      this._engineGain = ctx.createGain();
      this._engineGain.gain.value = 0;
      this._engineFilter.connect(this._engineGain);
      this._engineGain.connect(ctx.destination);
      this._engineOsc = ctx.createOscillator();
      this._engineOsc.type = 'sawtooth';
      this._engineOsc.frequency.value = 55;
      this._engineOsc.connect(this._engineFilter);
      this._engineOsc2 = ctx.createOscillator();
      this._engineOsc2.type = 'square';
      this._engineOsc2.frequency.value = 27.5;
      this._engineOsc2.detune.value = 7;
      const o2g = ctx.createGain();
      o2g.gain.value = 0.5;
      this._engineOsc2.connect(o2g);
      o2g.connect(this._engineFilter);
      this._engineOsc.start();
      this._engineOsc2.start();
    } catch (e) {
      this._engineCtx = null;
    }
  }
  private updateEngineAudio(dt: number) {
    // Audio parameters need not be rewritten every render frame; this keeps
    // Web Audio work bounded on phones while retaining responsive pitch.
    const nowMs = performance.now();
    if (nowMs - this._lastEngineUpdate < 33) return;
    this._lastEngineUpdate = nowMs;
    if (!this._engineCtx) {
      if (!this.isInCar) return;
      const t = this.vehicleType;
      if (t === 'boat' || t === 'helicopter' || t === 'plane') return;
      this.initEngineAudio();
      if (!this._engineCtx) return;
    }
    if (this._engineCtx.state === 'suspended') { try { this._engineCtx.resume(); } catch { } }
    const driving = this.isInCar && this.vehicleType !== 'boat' && this.vehicleType !== 'helicopter' && this.vehicleType !== 'plane';
    if (!driving) {
      // On foot / passenger / dead — let the engine fade out.
      this._engineLevel *= Math.max(0, 1 - 6 * dt);
      if (this._engineGain) this._engineGain.gain.value = this._engineLevel * this.carSfxVolume;
      return;
    }
    const isBike = this.vehicleType === 'motorcycle';
    const speed = Math.abs(this.carSpeed);
    const throttle = this.keys.has('KeyW') || (this.isMobile && this.joystickActive && this.joystickY > 0.1) ? 1 : 0;
    const braking = (this.keys.has('KeyS') || this.keys.has('Space')) && speed > 2 ? 1 : 0;
    const base = isBike ? 100 : 55;
    const top = isBike ? 340 : 155;
    // Normalize against the doubled top speeds so the engine note keeps
    // rising across the new speed range instead of peaking early.
    const speedNorm = Math.min(1, speed / (isBike ? 140 : 110));
    const rpm = base + (top - base) * Math.min(1, 0.30 + speedNorm * 0.55 + throttle * 0.25 - braking * 0.12);
    const level = 0.055 + speedNorm * 0.10 + throttle * 0.05 + braking * 0.02;
    const loadTarget = Math.min(1, throttle * 0.7 + speedNorm * 0.35 + braking * 0.2);
    this._engineLoad += (loadTarget - this._engineLoad) * Math.min(1, 8 * dt);
    this._engineLevel += (level - this._engineLevel) * Math.min(1, 7 * dt);
    if (this._engineOsc) this._engineOsc.frequency.value = rpm;
    if (this._engineOsc2) this._engineOsc2.frequency.value = rpm * 0.5;
    if (this._engineFilter) this._engineFilter.frequency.value = 220 + this._engineLevel * 760 + this._engineLoad * 520;
    if (this._engineGain) this._engineGain.gain.value = this._engineLevel * this.carSfxVolume * (isBike ? 0.78 : 1);
  }
  private stopAllGrandTheftAudio(): void {
    this.stopRadio();
    this.radioOn = false;
    try { this.ytPlayer?.stopVideo?.(); } catch { }
    try { this.ytPlayer?.destroy?.(); } catch { }
    this.ytPlayer = null;
    this.radioPlayerReady = false;
    this.stopEngineAudio();
    this.stopTrafficAudio();
    this.stopHeliAudio();
    for (const audio of [this.uziSound, this.rocketSound, this.policeSirenSound]) {
      if (!audio) continue;
      try { audio.pause(); } catch { }
      try { audio.currentTime = 0; } catch { }
      try { audio.src = ''; audio.load(); } catch { }
    }
    this.uziSound = null;
    this.rocketSound = null;
    this.policeSirenSound = null;
    this.audioUnlocked = false;
  }
  private stopEngineAudio() {
    try {
      for (const o of [this._engineOsc, this._engineOsc2]) {
        if (o) { try { o.stop(); } catch { } try { o.disconnect(); } catch { } }
      }
      if (this._engineGain) { try { this._engineGain.disconnect(); } catch { } }
      if (this._engineFilter) { try { this._engineFilter.disconnect(); } catch { } }
      if (this._engineCtx) { try { this._engineCtx.close(); } catch { } }
    } catch (e) { }
    this._engineCtx = null; this._engineOsc = null; this._engineOsc2 = null;
    this._engineFilter = null; this._engineGain = null; this._engineLevel = 0; this._engineLoad = 0; this._lastEngineUpdate = 0;
  }
  /** One shared soft hum for nearby moving NPC traffic, panned to where the cars are. */
  private initTrafficAudio() {
    if (this._trafficCtx) return;
    try {
      const ctx = new AudioContext();
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch { } }
      this._trafficCtx = ctx;
      this._trafficFilter = ctx.createBiquadFilter();
      this._trafficFilter.type = 'lowpass';
      this._trafficFilter.frequency.value = 220;
      this._trafficFilter.Q.value = 1.0;
      this._trafficGain = ctx.createGain();
      this._trafficGain.gain.value = 0;
      this._trafficPan = ctx.createStereoPanner();
      this._trafficPan.pan.value = 0;
      this._trafficFilter.connect(this._trafficGain);
      this._trafficGain.connect(this._trafficPan);
      this._trafficPan.connect(ctx.destination);
      this._trafficOsc = ctx.createOscillator();
      this._trafficOsc.type = 'sawtooth';
      this._trafficOsc.frequency.value = 60;
      this._trafficOsc.connect(this._trafficFilter);
      this._trafficOsc2 = ctx.createOscillator();
      this._trafficOsc2.type = 'triangle';
      this._trafficOsc2.frequency.value = 30;
      const o2g = ctx.createGain();
      o2g.gain.value = 0.6;
      this._trafficOsc2.connect(o2g);
      o2g.connect(this._trafficFilter);
      this._trafficOsc.start();
      this._trafficOsc2.start();
    } catch (e) {
      this._trafficCtx = null;
    }
  }
  private updateTrafficAudio(dt: number) {
    let loud = 0, maxSpeed = 0, panNum = 0, panDen = 0;
    for (const v of [...this.serverNPCs, ...this.trafficCars]) {
      if ((v.health ?? 0) <= 0) continue;
      const spd = Math.abs(v.speed ?? 0);
      if (spd < 1) continue; // parked / stopped cars stay quiet
      const dx = v.x - this.carX, dz = v.z - this.carZ;
      const dist = Math.hypot(dx, dz);
      if (dist > 45) continue;
      const speedNorm = Math.min(1, spd / 40);
      const c = speedNorm * Math.max(0, 1 - dist / 45);
      if (c < 0.02) continue;
      loud += c;
      if (spd > maxSpeed) maxSpeed = spd;
      const relAngle = Math.atan2(dx, dz) - this.camYaw;
      const pan = Math.sin(relAngle);
      panNum += pan * c;
      panDen += c;
    }
    if (loud <= 0) {
      // No nearby traffic — fade the drone out (idle context stays silent).
      this._trafficLevel *= Math.max(0, 1 - 5 * dt);
      if (this._trafficGain) this._trafficGain.gain.value = this._trafficLevel * this.carSfxVolume * 0.28;
      return;
    }
    if (!this._trafficCtx) {
      this.initTrafficAudio();
      if (!this._trafficCtx) return;
    }
    if (this._trafficCtx.state === 'suspended') { try { this._trafficCtx.resume(); } catch { } }
    const targetLevel = Math.min(0.8, loud * 0.4);
    const rpm = 58 + Math.min(1, maxSpeed / 45) * 110;
    this._trafficLevel += (targetLevel - this._trafficLevel) * Math.min(1, 4 * dt);
    if (this._trafficOsc) this._trafficOsc.frequency.value = rpm;
    if (this._trafficOsc2) this._trafficOsc2.frequency.value = rpm * 0.5;
    if (this._trafficFilter) this._trafficFilter.frequency.value = 180 + this._trafficLevel * 500;
    if (this._trafficGain) this._trafficGain.gain.value = this._trafficLevel * this.carSfxVolume * 0.28;
    // Smooth the pan too, so cars entering range don't yank the stereo image.
    const targetPan = panDen > 0.001 ? Math.max(-1, Math.min(1, panNum / panDen)) : 0;
    if (this._trafficPan) this._trafficPan.pan.value += (targetPan - this._trafficPan.pan.value) * Math.min(1, 4 * dt);
  }
  private stopTrafficAudio() {
    try {
      for (const o of [this._trafficOsc, this._trafficOsc2]) {
        if (o) { try { o.stop(); } catch { } try { o.disconnect(); } catch { } }
      }
      if (this._trafficGain) { try { this._trafficGain.disconnect(); } catch { } }
      if (this._trafficPan) { try { this._trafficPan.disconnect(); } catch { } }
      if (this._trafficFilter) { try { this._trafficFilter.disconnect(); } catch { } }
      if (this._trafficCtx) { try { this._trafficCtx.close(); } catch { } }
    } catch (e) { }
    this._trafficCtx = null; this._trafficOsc = null; this._trafficOsc2 = null;
    this._trafficFilter = null; this._trafficGain = null; this._trafficPan = null; this._trafficLevel = 0;
  }
  // Short procedural metal-crunch for collisions: noise through a bandpass swept
  // down + a low sine thud. Severity (0..1) scales loudness and length, and the
  // global throttle stops a grinding overlap from firing every frame.
  /** Impact feedback: decaying camera shake, plus brief slow-mo on hard hits. */
  private applyCrashImpact(severity: number) {
    if (severity <= 0) return;
    this.crashShake = Math.min(1.4, Math.max(this.crashShake, severity * 1.1));
    if (severity >= 0.6) {
      this.timeScale = Math.min(this.timeScale, 0.35);
      this.slowMoTimer = 0.3 + severity * 0.25;
    }
  }
  private playCrashSound(severity: number) {
    if (this.carSfxVolume <= 0 || severity <= 0) return;
    const now = performance.now();
    if (now - this._lastCrashTime < 350) return;
    this._lastCrashTime = now;
    try {
      if (!this._crashCtx) {
        this._crashCtx = new AudioContext();
        if (this._crashCtx.state === 'suspended') { try { this._crashCtx.resume(); } catch { } }
      }
      const ctx = this._crashCtx;
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch { } }
      const dur = 0.22 + severity * 0.3;
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 0.9;
      bp.frequency.setValueAtTime(1400 + 600 * severity, ctx.currentTime);
      bp.frequency.exponentialRampToValueAtTime(240, ctx.currentTime + dur);
      const g = ctx.createGain();
      const vol = 0.5 * severity * this.carSfxVolume;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      src.connect(bp); bp.connect(g); g.connect(ctx.destination);
      src.start();
      src.stop(ctx.currentTime + dur);
      // Low impact thud layered under the crunch.
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120 + 60 * severity, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(38, ctx.currentTime + 0.25);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, ctx.currentTime);
      og.gain.exponentialRampToValueAtTime(0.45 * severity * this.carSfxVolume, ctx.currentTime + 0.02);
      og.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
      osc.connect(og); og.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch (e) { }
  }
  /** Short dull body-blow thud for unarmed fight-back punches. */
  private playPunchThud() {
    if (this.sfxVolume <= 0) return;
    const now = performance.now();
    if (now - this._lastPunchTime < 150) return;
    this._lastPunchTime = now;
    try {
      if (!this._punchCtx) {
        this._punchCtx = new AudioContext();
        if (this._punchCtx.state === 'suspended') { try { this._punchCtx.resume(); } catch { } }
      }
      const ctx = this._punchCtx;
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch { } }
      const dur = 0.13;
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      // Muffled lowpass (no metallic crunch) — a fist on the jaw, not sheet metal.
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(500, ctx.currentTime);
      lp.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + dur);
      const g = ctx.createGain();
      const vol = 0.42 * this.sfxVolume;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      src.connect(lp); lp.connect(g); g.connect(ctx.destination);
      src.start();
      src.stop(ctx.currentTime + dur);
      // Low body-thump layered underneath.
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(95, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(42, ctx.currentTime + 0.18);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, ctx.currentTime);
      og.gain.exponentialRampToValueAtTime(0.4 * this.sfxVolume, ctx.currentTime + 0.012);
      og.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
      osc.connect(og); og.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    } catch (e) { }
  }
  /** Bright cash-register 'ching' played when a money stack is collected. */
  private playCashPickup() {
    if (this.sfxVolume <= 0) return;
    const now = performance.now();
    if (now - this._lastCashTime < 90) return;
    this._lastCashTime = now;
    try {
      if (!this._cashCtx) {
        this._cashCtx = new AudioContext();
        if (this._cashCtx.state === 'suspended') { try { this._cashCtx.resume(); } catch { } }
      }
      const ctx = this._cashCtx;
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch { } }
      const vol = 0.3 * this.sfxVolume;
      // Two quick ascending sine blips — the classic cash-register 'ching'.
      for (const [freq, delay] of [[1760, 0], [2637, 0.09]] as [number, number][]) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const g = ctx.createGain();
        const t0 = ctx.currentTime + delay;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.2);
      }
    } catch (e) { }
  }
  /** Bullet ricochet 'zing' for NPC shots whizzing past the player. */
  private playRicochetZing(volumeScale: number = 1) {
    if (this.sfxVolume <= 0) return;
    const now = performance.now();
    if (now - this._lastRicochetTime < 300) return;
    this._lastRicochetTime = now;
    try {
      if (!this._ricochetCtx) {
        this._ricochetCtx = new AudioContext();
        if (this._ricochetCtx.state === 'suspended') { try { this._ricochetCtx.resume(); } catch { } }
      }
      const ctx = this._ricochetCtx;
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch { } }
      const t0 = ctx.currentTime;
      const dur = 0.22;
      // Descending sine whistle — the classic ricochet zing.
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(3400, t0);
      osc.frequency.exponentialRampToValueAtTime(900, t0 + dur);
      const g = ctx.createGain();
      const vol = 0.16 * this.sfxVolume * volumeScale;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      // Subtle metallic noise sparkle layered on the front of the zing.
      const len = Math.floor(ctx.sampleRate * 0.09);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 6;
      bp.frequency.value = 4200;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(vol * 0.7, t0);
      ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
      src.connect(bp); bp.connect(ng); ng.connect(ctx.destination);
      src.start(t0);
      src.stop(t0 + 0.09);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur);
    } catch (e) { }
  }
  /** GTA-style busted sting: a radio squelch chirp keying up a two-tone police
   *  wail, played when the booking completes so the bust reads cinematically. */
  private playBustedSting() {
    if (this.sfxVolume <= 0) return;
    try {
      if (!this._bustedCtx) {
        this._bustedCtx = new AudioContext();
        if (this._bustedCtx.state === 'suspended') { try { this._bustedCtx.resume(); } catch { } }
      }
      const ctx = this._bustedCtx;
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch { } }
      const t0 = ctx.currentTime;
      const vol = 0.2 * this.sfxVolume;
      // Radio squelch chirp on key-up (brief noise burst before the wail).
      const len = Math.floor(ctx.sampleRate * 0.05);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 4;
      bp.frequency.value = 1900;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(vol * 0.5, t0);
      ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
      src.connect(bp); bp.connect(ng); ng.connect(ctx.destination);
      src.start(t0);
      src.stop(t0 + 0.05);
      // Two-tone police wail — three quick low→high sweeps, like a siren keying up.
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const cycles = 3;
      const cyc = 0.3;
      for (let c = 0; c < cycles; c++) {
        const cs = t0 + 0.05 + c * cyc;
        osc.frequency.setValueAtTime(620, cs);
        osc.frequency.linearRampToValueAtTime(830, cs + cyc / 2);
        osc.frequency.linearRampToValueAtTime(620, cs + cyc);
      }
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0 + 0.05);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.09);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05 + cycles * cyc);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(t0 + 0.05);
      osc.stop(t0 + 0.05 + cycles * cyc);
      // Low body thump under the wail so the sting has weight.
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(120, t0 + 0.05);
      sub.frequency.exponentialRampToValueAtTime(70, t0 + 0.95);
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.0001, t0 + 0.05);
      sg.gain.exponentialRampToValueAtTime(0.5 * this.sfxVolume, t0 + 0.1);
      sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.0);
      sub.connect(sg); sg.connect(ctx.destination);
      sub.start(t0 + 0.05);
      sub.stop(t0 + 1.0);
    } catch (e) { }
  }
  /** GTA-style wasted sting: a heavy impact crack falling into a low descending
   *  boom with a heartbeat double-pulse — the mirror of the busted sting, played
   *  when the player dies and the WASTED screen appears. */
  private playWastedSting() {
    if (this.sfxVolume <= 0) return;
    try {
      if (!this._wastedCtx) {
        this._wastedCtx = new AudioContext();
        if (this._wastedCtx.state === 'suspended') { try { this._wastedCtx.resume(); } catch { } }
      }
      const ctx = this._wastedCtx;
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch { } }
      const t0 = ctx.currentTime;
      const vol = 0.28 * this.sfxVolume;
      // Impact crack: a short low-passed noise burst — the "hit" of going down.
      const len = Math.floor(ctx.sampleRate * 0.09);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 380;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(vol * 1.6, t0);
      ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
      src.connect(lp); lp.connect(ng); ng.connect(ctx.destination);
      src.start(t0);
      src.stop(t0 + 0.09);
      // Heavy descending boom — a low sine falling 90 → 45 Hz with a slow swell
      // and a heartbeat double-pulse, the classic GTA wasted thud.
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(90, t0 + 0.01);
      osc.frequency.exponentialRampToValueAtTime(45, t0 + 1.4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.08);
      g.gain.exponentialRampToValueAtTime(vol * 0.45, t0 + 0.22);
      g.gain.exponentialRampToValueAtTime(vol * 0.9, t0 + 0.34);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.5);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(t0 + 0.01);
      osc.stop(t0 + 1.5);
      // A darker triangle layer an octave down adds weight without harshness.
      const sub = ctx.createOscillator();
      sub.type = 'triangle';
      sub.frequency.setValueAtTime(55, t0 + 0.01);
      sub.frequency.exponentialRampToValueAtTime(30, t0 + 1.3);
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.0001, t0 + 0.01);
      sg.gain.exponentialRampToValueAtTime(vol * 0.7, t0 + 0.1);
      sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4);
      sub.connect(sg); sg.connect(ctx.destination);
      sub.start(t0 + 0.01);
      sub.stop(t0 + 1.4);
    } catch (e) { }
  }
  /** Ambient police-radio chatter after a bust: a few seconds of garbled,
   *  squelchy radio voices — two "officers" trading clipped transmissions — so
   *  the station scene behind the BUSTED screen feels lived-in. Voice-ish noise
   *  puffs through bandpass filters with wobbling center frequencies, plus
   *  periodic squelch chirps as radios key up and down. */
  private playStationRadioChatter() {
    if (this.sfxVolume <= 0) return;
    try {
      if (!this._radioCtx) {
        this._radioCtx = new AudioContext();
        if (this._radioCtx.state === 'suspended') { try { this._radioCtx.resume(); } catch { } }
      }
      const ctx = this._radioCtx;
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch { } }
      const t0 = ctx.currentTime;
      const vol = 0.12 * this.sfxVolume;
      // Two radio voices: different bandpass centers and cadences so they read
      // as separate officers. The first transmission keys up right as the
      // busted sting's siren wail dies (~0.9s in).
      const voices = [
        { freq: 850, q: 1.4, count: 7, minLen: 0.09, maxLen: 0.22, gapMin: 0.18, gapMax: 0.5, start: 0.9 },
        { freq: 1250, q: 1.8, count: 5, minLen: 0.07, maxLen: 0.16, gapMin: 0.3, gapMax: 0.65, start: 1.3 },
      ];
      for (const v of voices) {
        let t = t0 + v.start + Math.random() * 0.3;
        for (let i = 0; i < v.count; i++) {
          const lenSec = v.minLen + Math.random() * (v.maxLen - v.minLen);
          const len = Math.max(1, Math.floor(ctx.sampleRate * lenSec));
          const buf = ctx.createBuffer(1, len, ctx.sampleRate);
          const data = buf.getChannelData(0);
          for (let s = 0; s < len; s++) data[s] = Math.random() * 2 - 1;
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.Q.value = v.q;
          // Wobble the center frequency mid-puff — the classic radio garble.
          bp.frequency.setValueAtTime(v.freq, t);
          bp.frequency.linearRampToValueAtTime(v.freq * (1.15 + Math.random() * 0.3), t + lenSec / 2);
          bp.frequency.linearRampToValueAtTime(v.freq, t + lenSec);
          const g = ctx.createGain();
          // Sharp attack, exponential decay — clipped radio syllables.
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(vol * (0.5 + Math.random() * 0.8), t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + lenSec);
          src.connect(bp); bp.connect(g); g.connect(ctx.destination);
          src.start(t);
          src.stop(t + lenSec);
          t += lenSec + v.gapMin + Math.random() * (v.gapMax - v.gapMin);
        }
      }
      // Periodic squelch chirps between transmissions, like radios keying up.
      for (let i = 0; i < 3; i++) {
        const ct = t0 + 1.2 + i * 1.5 + Math.random() * 0.2;
        const len = Math.max(1, Math.floor(ctx.sampleRate * 0.04));
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let s = 0; s < len; s++) data[s] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 4;
        bp.frequency.value = 1900;
        const g = ctx.createGain();
        g.gain.setValueAtTime(vol * 0.6, ct);
        g.gain.exponentialRampToValueAtTime(0.0001, ct + 0.04);
        src.connect(bp); bp.connect(g); g.connect(ctx.destination);
        src.start(ct);
        src.stop(ct + 0.04);
      }
    } catch (e) { }
  }
  // Distant traffic crashes: NPC cars bumping into each other or parked cars
  // near the player. Runs at 10 Hz; per-pair cooldown stops repeats.
  private updateNPCCrashSounds() {
    if (this.carSfxVolume <= 0) return;
    const now = performance.now();
    const moving = [...this.serverNPCs, ...this.trafficCars];
    if (moving.length === 0) return;
    const check = (a: any, b: any) => {
      const dx = a.x - b.x, dz = a.z - b.z;
      const d = Math.hypot(dx, dz);
      // Tight gate so traffic merely passing curb-parked cars doesn't thud
      // constantly: real impacts need close contact and a solid speed gap.
      if (d < 2.6 && d > 0.1) {
        const relSpeed = Math.abs((a.speed || 0) - (b.speed || 0));
        if (relSpeed >= 8) {
          const key = `${a.id}:${b.id}`;
          const last = this._npcCrashCooldowns.get(key) || 0;
          if (now - last > 800) {
            this._npcCrashCooldowns.set(key, now);
            if (this._npcCrashCooldowns.size > 120) this._npcCrashCooldowns.clear();
            const dist = Math.hypot(a.x - this.carX, a.z - this.carZ);
            if (dist < 45) this.playCrashSound(Math.min(1, relSpeed / 25) * (1 - dist / 50));
          }
        }
      }
    };
    for (let i = 0; i < moving.length; i++) {
      for (let j = i + 1; j < moving.length; j++) check(moving[i], moving[j]);
      for (const p of this.parkedCars) {
        if (p.health > 0) check(moving[i], p);
      }
    }
  }
  /** Brief 'MURDER' HUD flash + wanted-star pop when a local-NPC kill draws heat. */
  private showMurderFlash() {
    this.murderFlashAlpha = 0.75;
    this.murderFlashTimer = 0.9;
    this.wantedPopTimer = 0.7;
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
            this.gtService.hit(this.getUserId(), t.userId, 1, dmg, ox, oz, this.currentWeapon).then((res: any) => {
              if (res && res.targetHealth !== undefined) t.health = res.targetHealth;
            });
          } else {
            const wasAlive = (t.health ?? 100) > 0;
            t.health = (t.health ?? 100) - dmg;
            // Track the player's damage contribution on thug cars so payouts
            // scale with it and full payout requires the killing blow
            // (anti-farm: half-killing and ignoring a convoy must not pay).
            if (list === this.policeModeThugCars) {
              t.playerDamage = Math.min(t.maxHealth, (t.playerDamage ?? 0) + dmg);
              if (wasAlive && t.health <= 0) t.killedByPlayer = true;
            }
            this.gtService.hit(this.getUserId(), t.id, 1, dmg, ox, oz, this.currentWeapon);
            this.score += 10;
            // Local peds have no server presence (ids the server never sees) —
            // mirror the server's FightBackUntil logic so the crowd retaliates
            // with unarmed punches when provoked with bare fists.
            if (list === this.localPedestrians && this.currentWeapon === 0 && t.health > 0) {
              t.fightBackUntil = performance.now() / 1000 + 8;
              t.punchTimer = 0;
              t.panicUntil = undefined; // standing your ground beats running
              // Nearby local peds panic and flee from the fight (mirror of the
              // server's panic radius) — except the one throwing down.
              const nowSec = performance.now() / 1000;
              for (const other of this.localPedestrians) {
                if (other === t || other.fightBackUntil) continue;
                if (Math.hypot(other.x - t.x, other.z - t.z) < 10) {
                  other.panicUntil = nowSec + 5;
                  other.panicFromX = t.x;
                  other.panicFromZ = t.z;
                }
              }
            }
            // Report the killing blow of a client-local NPC so the murder still
            // draws police heat and counts toward kill stats.
            if (list === this.localPedestrians && wasAlive && t.health <= 0) {
              this.gtService.hit(this.getUserId(), t.id, 1, dmg, ox, oz, this.currentWeapon, true);
              this.dropMoneyAt(t.x, t.z, 50 + Math.floor(Math.random() * 150));
              this.showMurderFlash();
            }
          }
          return true;
        }
      }
      return false;
    };
    checkTargets(this.otherPlayers, true);
    checkTargets(this.serverPedestrians, false);
    checkTargets(this.localPedestrians, false);
    checkTargets(this.policeModeThugPeds, false);
    checkTargets(this.serverNPCs, false);
    checkTargets(this.policeModeThugCars, false);
    checkTargets(this.parkedCars, false);
    // Check chicken hits
    const chickens = this.renderer.getNearbyChickens(ox, oz, maxRange);
    for (const c of chickens) {
      const vx = c.x - ox, vz = c.z - oz;
      const proj = vx * dx + vz * dz;
      if (proj < 0 || proj > maxRange) continue;
      const closestX = ox + dx * proj, closestZ = oz + dz * proj;
      if (Math.hypot(c.x - closestX, c.z - closestZ) < 0.5) {
        const key = `${c.x},${c.z}`;
        if (!this.renderer.deadChickens.has(key)) {
          this.renderer.deadChickens.add(key);
          this.spawnBlood(c.x, 0.3, c.z, dx, 0, dz);
          this.score += 5;
        }
        return;
      }
    }
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
          // Keep the station a charred ruin for the full cooldown (the draw
          // pass only stays dark while the timer is fresh).
          this.renderer.explodedGasStationTimers.set(key, performance.now());
          this.spawnGasStationExplosion(gs.x, gs.z);
        }
        return;
      }
    }
  }
  private spawnBlood(x: number, y: number, z: number, dirX: number = 0, dirY: number = 0, dirZ: number = 0, small = false) {
    const dirLen = Math.hypot(dirX, dirY, dirZ);
    const nx = dirLen > 0.0001 ? dirX / dirLen : 0;
    const ny = dirLen > 0.0001 ? dirY / dirLen : 0;
    const nz = dirLen > 0.0001 ? dirZ / dirLen : 0;
    // small = a punch-connect puff: fewer, smaller, faster particles and no
    // persistent ground pool, vs. the full splash for gunfire/impacts.
    const PARTICLE_COUNT = small ? 6 : 14;
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
        size: small ? 0.05 + Math.random() * 0.06 : 0.08 + Math.random() * 0.12,
        age: 0,
        lifetime: small ? 0.35 + Math.random() * 0.3 : 0.6 + Math.random() * 0.5,
      });
    }
    if (!small && y < 1.6) {
      this.bloodPools.push({ x, z, age: 0, lifetime: 30, maxRadius: 1.5, variant: Math.floor(Math.random() * 4) });
    }
  }
  private spawnBulletSmoke(ox: number, oy: number, oz: number, dirX: number, dirY: number, dirZ: number, weapon: number = 1) {
    if (weapon === 0) return;
    const count = weapon === 4 ? 5 : 1;
    for (let i = 0; i < count; i++) {
      this.bulletSmoke.push({
        x: ox + (Math.random() - 0.5) * 0.3,
        y: oy + (Math.random() - 0.5) * 0.3,
        z: oz + (Math.random() - 0.5) * 0.3,
        vx: dirX * (0.5 + Math.random() * 2) + (Math.random() - 0.5) * 0.8,
        vy: dirY * (0.5 + Math.random() * 2) + (Math.random() - 0.5) * 0.8,
        vz: dirZ * (0.5 + Math.random() * 2) + (Math.random() - 0.5) * 0.8,
        size: 0.2 + Math.random() * 0.3,
        age: 0,
        lifetime: 0.5 + Math.random() * 0.4,
      });
    }
  }
  private spawnBulletTrail(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, weapon: number = 1) {
    if (weapon === 0) return;
    const trailLength = 40;
    const numParticles = weapon === 4 ? 6 : weapon; // 1 for pistol, 2 for rifle, 3 for shotgun, 6 for rocket
    for (let i = 0; i < numParticles; i++) {
      const t = (i + 0.5) / numParticles;
      this.bulletSmoke.push({
        x: ox + dx * trailLength * t + (Math.random() - 0.5) * 0.15,
        y: oy + dy * trailLength * t + (Math.random() - 0.5) * 0.15,
        z: oz + dz * trailLength * t + (Math.random() - 0.5) * 0.15,
        vx: (Math.random() - 0.5) * 0.3,
        vy: 0.2 + Math.random() * 0.3,
        vz: (Math.random() - 0.5) * 0.3,
        size: 0.1 + Math.random() * 0.15,
        age: 0,
        lifetime: 0.3 + Math.random() * 0.3,
      });
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
      this.garageExitedCar = false;
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
                  : this.renderer.getNPCCarMesh(col, userId);
              } else if (this.garageCar.vehicleType === 'bus') {
                this.garageCarMesh = this.renderer.busMesh || this.renderer.getNPCCarMesh(col, userId);
              } else if (this.garageCar.vehicleType === 'police') {
                this.garageCarMesh = this.renderer.getPoliceCarMesh();
              } else if (this.garageCar.vehicleType === 'helicopter') {
                this.garageCarMesh = this.renderer.getHelicopterMesh(userId);
              } else if (this.garageCar.vehicleType === 'plane') {
                this.garageCarMesh = this.renderer.getPlaneMesh(userId);
              } else {
                this.garageCarMesh = this.renderer.getNPCCarMesh(col, userId);
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
    if (nearGarage && !this.isInCar && !this.isPassenger && !this.garageExitedCar && this.garageCar && this.garageCarMesh && this.garageStoreCooldown <= 0) {
      this.carX = GARAGE_INTERIOR_X;
      this.carZ = GARAGE_INTERIOR_Z;
      this.carYaw = this.garageCar.yaw;
      this.carVx = 0; this.carVz = 0; this.carSpeed = 0;
      this.isInCar = true;
      this.vehicleType = this.garageCar.vehicleType as any;
      this.carHealth = 200;
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
      this.setVehicleCameraProfile();
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
  /**
   * A gas station going up is a station-scale event, not a barrel pop. The
   * fuel pumps cook off across the whole forecourt and the rear service
   * building goes up with them, while the main fuel-air blast hits everything
   * around the station at 2.5× a normal explosion (radius ~30, up to ~500
   * damage). Stations are always placed axis-aligned, so the pump offsets
   * from createGasStationMesh are used directly.
   */
  private spawnGasStationExplosion(x: number, z: number) {
    for (const [px, pz, life] of [[-7, -1, 1.6], [0, -1, 1.9], [7, -1, 1.6]] as const) {
      this.explosions.push({ x: x + px, y: 0.5, z: z + pz, age: 0, lifetime: life, scale: 1.5 });
    }
    this.explosions.push({ x, y: 1.5, z: z + 13, age: 0, lifetime: 1.8, scale: 1.7 });
    // Lingering fuel fireball so the station keeps burning after the blast.
    this.explosions.push({ x, y: 0.5, z, age: 0, lifetime: 2.6, scale: 2.6 });
    this.spawnExplosion(x, 0.5, z, 2.5);
  }
  private spawnExplosion(x: number, y: number, z: number, blastScale: number = 1) {
    this.explosions.push({ x, y, z, age: 0, lifetime: 1.0, scale: blastScale });
    const BLAST_RADIUS = 12.0 * blastScale;
    const BLAST_MAX_DMG = Math.round(200 * blastScale);
    const BLAST_MIN_DMG = Math.round(50 * blastScale);
    const dmgAt = (dist: number) => {
      if (dist >= BLAST_RADIUS) return 0;
      const t = dist / BLAST_RADIUS;
      return Math.round(BLAST_MAX_DMG - (BLAST_MAX_DMG - BLAST_MIN_DMG) * t);
    };
    const checkExplosionHits = (list: any[], isPlayer: boolean, isCar: boolean = false) => {
      for (const t of list) {
        const tx = t.posX !== undefined ? t.posX : t.x;
        const tz = t.posZ !== undefined ? t.posZ : t.z;
        const ty = (t.posY ?? t.y ?? 0.5);
        const dy = Math.abs(ty - y);
        if (dy > 8) continue;
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
          const wasAlive = (t.health ?? 100) > 0;
          t.health = (t.health ?? 100) - dmg;
          this.spawnBlood(tx, 1.0, tz, dx, 0, dz);
          this.gtService.hit(this.getUserId(), t.id, 1, dmg, this.carX, this.carZ);
          // Report the killing blow of a client-local NPC so explosions on the
          // crowd draw police heat and count toward kill stats.
          if (list === this.localPedestrians && wasAlive && t.health <= 0) {
            this.gtService.hit(this.getUserId(), t.id, 1, dmg, this.carX, this.carZ, -1, true);
            this.showMurderFlash();
          }
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
  /**
   * Per-car lateral offset from the lane centerline: a stable driving-style
   * bias plus a slow in-lane wander. Keeps cars in the same direction spread
   * across the road instead of driving single-file.
   */
  private trafficLateralOffset(car: any, laneOffX: number, laneOffZ: number): { x: number; z: number } {
    const perpLen = Math.hypot(laneOffX, laneOffZ);
    if (perpLen <= 0) return { x: 0, z: 0 };
    const now = performance.now() / 1000;
    const lat = (car.laneBias ?? 0) + Math.sin(now * (car.wanderFreq ?? 0.7) + (car.wanderPhase ?? 0)) * 0.8
      + (car.passExtra ?? 0); // emergency lane-change offset, eased by the loop
    return { x: laneOffX / perpLen * lat, z: laneOffZ / perpLen * lat };
  }

  private measureLead(car: any, ox: number, oz: number, oSpeed?: number) {
    const dx = ox - car.x;
    const dz = oz - car.z;
    const carFwdX = Math.sin(car.yaw);
    const carFwdZ = Math.cos(car.yaw);
    let ahead = dx * carFwdX + dz * carFwdZ;
    if (ahead <= 0) return;
    // Only treat obstacles roughly in the car's own track as leads — with
    // cars now spread laterally across the road, adjacent-track traffic
    // shouldn't make this car brake.
    const lateral = Math.abs(dx * carFwdZ - dz * carFwdX);
    if (lateral > 3.0) return;
    const dist = Math.hypot(dx, dz);
    if (dist < car.leadDist) {
      car.leadDist = dist;
      car.leadSpeed = oSpeed ?? 0;
    }
  }
  private updateTraffic(dt: number) {
    this.trafficSpawnTimer += dt;
    if (this.trafficSpawnTimer > 1.8) {
      this.trafficSpawnTimer = 0;
      // Staggered streaming keeps roads populated without spawning a large
      // batch in one frame. The cap is a hard memory/draw-call budget.
      if (this.trafficCars.length < this.LOCAL_TRAFFIC_CAP) {
          if (this.trafficNodes.length < 2) this.initTraffic();
        if (this.trafficNodes.length >= 2) this.spawnTrafficCar();
      }
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
      // The node array was replaced — old paths hold stale indices that now
      // point at different roads, so every car is re-routed from where it is.
      this.repathAllTraffic();
    }
    for (let ci = this.trafficCars.length - 1; ci >= 0; ci--) {
      const car = this.trafficCars[ci];
      // Despawn beyond the view distance (was 600 — the max view is ~640).
      if (Math.abs(car.x - this.carX) > 750 || Math.abs(car.z - this.carZ) > 750) {
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
        // Airport parking: if at a parking node, remove car from traffic
        if (this.isAtAirportParkingSpot(car.x, car.z)) {
          this.trafficCars.splice(ci, 1);
          continue;
        }
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
      const lateral = this.trafficLateralOffset(car, laneOffX, laneOffZ);
      const currLaneX = currNode.x + laneOffX + lateral.x;
      const currLaneZ = currNode.z + laneOffZ + lateral.z;
      const distToCurr = Math.hypot(currLaneX - car.x, currLaneZ - car.z);
      const targetX = nextNode ? nextNode.x + laneOffX + lateral.x : currNode.x;
      const targetZ = nextNode ? nextNode.z + laneOffZ + lateral.z : currNode.z;
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
      // Lead tracking lives on the car object (measureLead writes there) —
      // reset it every frame so cars actually slow for traffic ahead instead
      // of piling into stopped cars at full speed.
      car.leadDist = Infinity;
      car.leadSpeed = 12;
      for (const other of this.trafficCars) {
        if (other.id === car.id || other.health <= 0) continue;
        this.measureLead(car, other.x, other.z, other.speed);
      }
      for (const npc of this.serverNPCs) {
        if (npc.health <= 0) continue;
        this.measureLead(car, npc.x, npc.z, npc.speed);
      }
      for (const pc of this.parkedCars) {
        if (pc.health <= 0) continue;
        this.measureLead(car, pc.x, pc.z);
      }
      const nearbyLamps = this.renderer.getLampsNear(car.x, car.z, 8);
      for (const lamp of nearbyLamps) {
        this.measureLead(car, lamp.x, lamp.z);
      }
      for (const ped of this.localPedestrians) {
        if (ped.health <= 0) continue;
        this.measureLead(car, ped.x, ped.z);
      }
      for (const ped of this.serverPedestrians) {
        if (ped.health <= 0) continue;
        this.measureLead(car, ped.x, ped.z);
      }
      for (const op of this.otherPlayers) {
        if (op.health <= 0) continue;
        this.measureLead(car, op.posX, op.posZ, 12);
      }
      const followGain = 2.5;
      const safeSpeed = car.leadDist < Infinity ? Math.min(car.leadDist * followGain, car.leadSpeed) : 12;
      // Emergency lane change: when a stopped vehicle has kept this car pinned
      // in its track for a few seconds, swerve to the outer track (away from
      // oncoming traffic), drive past, then ease back — instead of waiting
      // behind it forever.
      if ((car.passCooldown ?? 0) > 0) car.passCooldown = (car.passCooldown ?? 0) - dt;
      if (car.passing) {
        car.passTimer = (car.passTimer ?? 3.0) - dt;
        if ((car.passTimer ?? 0) <= 0) {
          car.passing = false;
          car.passCooldown = 9; // don't re-trigger immediately in stop-and-go
        }
        car.passExtra = Math.min(6, (car.passExtra ?? 0) + Math.min(1, 5 * dt) * 6);
      } else {
        car.passExtra = Math.max(0, (car.passExtra ?? 0) - Math.min(1, 4 * dt) * 6);
        if ((car.passCooldown ?? 0) <= 0 && car.leadDist < 6 && car.leadSpeed < 2) {
          car.blockTimer = (car.blockTimer ?? 0) + dt;
          if (car.blockTimer > 2.5) {
            car.passing = true;
            car.passTimer = 3.0;
            car.blockTimer = 0;
          }
        } else {
          car.blockTimer = 0;
        }
      }
      let redLight = false;
      if (nextNode && distToTarget < intersectionRadius) {
        const isHDir = Math.abs(nextNode.x - currNode.x) > Math.abs(nextNode.z - currNode.z);
        // Only town intersections have signals — bridges and rural crossings
        // run free so cross-island traffic (the bridges) keeps moving.
        const nb = getBiome(Math.floor(nextNode.x / 80), Math.floor(nextNode.z / 80));
        const hasLight = nb === 'city' || nb === 'suburb' || nb === 'parking_lot';
        if (hasLight && ((isHDir && isRedForX) || (!isHDir && !isRedForX))) redLight = true;
      }
      if (distToTarget < 2) {
        car.pathIdx++;
        if (car.pathIdx < car.path.length) {
          const newTarget = this.trafficNodes[car.path[car.pathIdx]];
          car.yaw = Math.atan2(newTarget.x - currNode.x, newTarget.z - currNode.z);
        }
        continue;
      }
      let targetSpeed = safeSpeed;
      if (approachingTurn) targetSpeed = Math.min(targetSpeed, 4.5);
      if (crossBlocked) targetSpeed = Math.min(targetSpeed, 3.0);
      if (redLight) targetSpeed = 0; // full stop at the light — traffic behind queues
      // Emergency pass: keep enough speed to slide around the disabled
      // vehicle. A red light aborts the maneuver — the light clears on its
      // own, so there's nothing to drive around.
      if (car.passing && redLight) {
        car.passing = false;
        car.passCooldown = 5;
      } else if (car.passing) {
        targetSpeed = Math.max(targetSpeed, 4.5);
      }
      const tdx = targetX - car.x;
      const tdz = targetZ - car.z;
      const targetYaw = Math.atan2(tdx, tdz);
      let yawDiff2 = targetYaw - car.yaw;
      while (yawDiff2 > Math.PI) yawDiff2 -= Math.PI * 2;
      while (yawDiff2 < -Math.PI) yawDiff2 += Math.PI * 2;
      car.yaw += yawDiff2 * Math.min(1, 8 * dt);
      car.speed += (targetSpeed - car.speed) * Math.min(1, 5 * dt);
      const maxSpeed = Math.min(distToTarget / dt, 12);
      if (car.speed > maxSpeed) car.speed = maxSpeed;
      if (car.speed < 0) car.speed = 0;
      car.x += Math.sin(car.yaw) * car.speed * dt;
      car.z += Math.cos(car.yaw) * car.speed * dt;
      if (this.isOpenOceanPosition(car.x, car.z)) {
        this.trafficCars.splice(ci, 1);
        continue;
      }
    }
  }
  private updatePedestrians(dt: number) {
    this.pedSpawnTimer += dt;
    this.populationScanTimer += dt;
    const playerCX = Math.floor(this.carX / CHUNK_SIZE);
    const playerCZ = Math.floor(this.carZ / CHUNK_SIZE);
    // Only rebuild sidewalk nodes if the player has moved to a new chunk
    if (playerCX !== this._lastPedChunkX || playerCZ !== this._lastPedChunkZ) {
      this._lastPedChunkX = playerCX;
      this._lastPedChunkZ = playerCZ;
      this._cachedSidewalkNodes.length = 0; // Clear array without reallocating
      const viewRadius = 3;
      const _GRID_PITCH = 80;
      const _BLOCK_SIZE = 30;
      const blocksPerChunk = CHUNK_SIZE / _GRID_PITCH;
      const HOME_CHUNK_MIN_X = 1 * CHUNK_SIZE;
      const HOME_CHUNK_MAX_X = 1 * CHUNK_SIZE + CHUNK_SIZE;
      const HOME_CHUNK_MIN_Z = 0 * CHUNK_SIZE;
      const HOME_CHUNK_MAX_Z = 0 * CHUNK_SIZE + CHUNK_SIZE;
      for (let dz = -viewRadius; dz <= viewRadius; dz++) {
        for (let dx = -viewRadius; dx <= viewRadius; dx++) {
          const cx = playerCX + dx;
          const cz = playerCZ + dz;
          for (let by = 0; by < blocksPerChunk; by++) {
            for (let bx = 0; bx < blocksPerChunk; bx++) {
              const gx = cx * blocksPerChunk + bx;
              const gz = cz * blocksPerChunk + by;
              const bxCenter = gx * _GRID_PITCH + _GRID_PITCH / 2;
              const bzCenter = gz * _GRID_PITCH + _GRID_PITCH / 2;
              const halfSW = (_BLOCK_SIZE + 6) / 2;
              const inset = 1;
              // Pre-calculate the 4 corner nodes for this block
              const nodesToCheck = [
                { x: bxCenter - halfSW + inset, z: bzCenter - halfSW + inset },
                { x: bxCenter + halfSW - inset, z: bzCenter - halfSW + inset },
                { x: bxCenter + halfSW - inset, z: bzCenter + halfSW - inset },
                { x: bxCenter - halfSW + inset, z: bzCenter + halfSW - inset },
              ];
              // Inline the home-base filter check to avoid array allocations
              for (const n of nodesToCheck) {
                const nodeBiome = getBiome(Math.floor(n.x / CHUNK_SIZE), Math.floor(n.z / CHUNK_SIZE));
                if (nodeBiome === 'ocean') continue;
                if (n.x < HOME_CHUNK_MIN_X || n.x >= HOME_CHUNK_MAX_X ||
                  n.z < HOME_CHUNK_MIN_Z || n.z >= HOME_CHUNK_MAX_Z) {
                  this._cachedSidewalkNodes.push(n);
                }
              }
            }
          }
        }
      }
    }
    const sidewalkNodes = this._cachedSidewalkNodes;
    // Rebuild the node pool on chunk changes and periodically during play so
    // the population follows the camera bubble rather than remaining tied to
    // the first area visited.
    if (this.populationScanTimer > 5) {
      this.populationScanTimer = 0;
      this._lastPedChunkX = 999;
      this._lastPedChunkZ = 999;
    }
    if (this.pedSpawnTimer > 0.28 && this.localPedestrians.length < this.LOCAL_PED_CAP && sidewalkNodes.length > 0) {
      this.pedSpawnTimer = 0;
      const srcNode = sidewalkNodes[Math.floor(Math.random() * sidewalkNodes.length)];
      const dstNode = sidewalkNodes[Math.floor(Math.random() * sidewalkNodes.length)];
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
        waitTimer: isHooker ? 1.5 + Math.random() * 4 : 0,
        ...(isHooker ? { hookerStyle: Math.floor(Math.random() * 4), hookerGestureTimer: 0.4 + Math.random() * 1.2 } : {}),
      });
    }
    for (let i = this.localPedestrians.length - 1; i >= 0; i--) {
      const ped = this.localPedestrians[i];
      if (this.isOpenOceanPosition(ped.x, ped.z)) {
        this.localPedestrians.splice(i, 1);
        continue;
      }
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
        // Local pedestrians are client-owned, so their death never returns
        // through the server poll. Drop the same small cash reward as a server
        // pedestrian before removing the body from the active population.
        const collected = Number((ped as any).collectedMoney ?? 0);
        // A death produces one loot drop. The collected amount is folded into
        // the normal death payout instead of creating a second cash stack.
        this.dropMoneyAt(ped.x, ped.z, 50 + Math.floor(Math.random() * 150) + Math.max(0, Math.floor(collected)));
        this.localPedestrians.splice(i, 1);
        continue;
      }
      const pedDistance = Math.hypot(ped.x - this.carX, ped.z - this.carZ);
      if (pedDistance > 520) {
        this.localPedestrians.splice(i, 1); continue;
      }
      // Provoked peds chase the player and throw punches — client mirror of the
      // server's FightBackUntil (8s window, 1.6x run speed, 1.7 range, 700ms
      // swing cooldown, 4 dmg). They give up if you get in a car or die.
      if (ped.fightBackUntil) {
        const nowSec = performance.now() / 1000;
        if (nowSec >= ped.fightBackUntil) {
          ped.fightBackUntil = undefined;
          ped.punchTimer = undefined;
        } else if (!this.isInCar && !this.taxiRideActive && this.health > 0) {
          const pdx = this.carX - ped.x;
          const pdz = this.carZ - ped.z;
          const pdist = Math.hypot(pdx, pdz);
          ped.yaw = Math.atan2(pdx, pdz);
          if (pdist > 1.7) {
            const chaseSpeed = 2 * 1.6;
            ped.x += Math.sin(ped.yaw) * chaseSpeed * dt;
            ped.z += Math.cos(ped.yaw) * chaseSpeed * dt;
          } else if (!ped.punchTimer || nowSec - ped.punchTimer > 0.7) {
            ped.punchTimer = nowSec;
            // Swing the arm so the retaliation reads as a punch, not just blood.
            this.renderer.triggerPunch(ped.id);
            this.spawnBlood(this.carX, 1.2, this.carZ, pdx / pdist, 0, pdz / pdist);
            // Report as an anonymous NPC hit so the damage survives the next
            // health poll sync (server _playerHealth is authoritative), without
            // raising the player's own wanted level.
            this.gtService.hit(0, this.getUserId(), 1, 4, this.carX, this.carZ, 0);
            this.health = Math.max(0, this.health - 4);
            // Immediate red hurt flash (the server health sync confirms later)
            // plus a dull body-blow thud so the retaliation reads clearly.
            this.damageAlpha = 0.45;
            this.playPunchThud();
          }
          continue;
        }
      }
      // Panicking peds sprint away from the fight for ~5s, then resume their
      // sidewalk routine.
      if (ped.panicUntil) {
        const nowSec = performance.now() / 1000;
        if (nowSec >= ped.panicUntil) {
          ped.panicUntil = undefined;
        } else {
          const pdx = ped.x - (ped.panicFromX ?? ped.x);
          const pdz = ped.z - (ped.panicFromZ ?? ped.z);
          const pdist = Math.hypot(pdx, pdz) || 0.01;
          ped.yaw = Math.atan2(pdx, pdz);
          const panicSpeed = 3.4;
          ped.x += Math.sin(ped.yaw) * panicSpeed * dt;
          ped.z += Math.cos(ped.yaw) * panicSpeed * dt;
          continue;
        }
      }
      if (ped.waitTimer > 0) {
        ped.waitTimer -= dt;
        if (ped.type === 'hooker') {
          ped.hookerGestureTimer = (ped.hookerGestureTimer ?? 0) - dt;
          if ((ped.hookerGestureTimer ?? 0) <= 0) ped.hookerGestureTimer = 0.8 + Math.random() * 1.8;
          // Stay on the corner while signaling instead of immediately joining
          // the generic sidewalk flow.
          ped.yaw += Math.sin(performance.now() / 420 + (ped.hookerStyle ?? 0)) * dt * 0.35;
        }
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
      const speed = ped.type === 'hooker' ? 1.55 : 2;
      ped.x += Math.sin(ped.yaw) * speed * dt;
      ped.z += Math.cos(ped.yaw) * speed * dt;
    }
  }
  /** Occasional station cop traffic: a local cop walks out of a police-station
   *  door toward the street, or in from the street to the door, so stations
   *  feel lived-in between arrests. Purely visual (client-local like
   *  localPedestrians) — they linger briefly on arrival, then despawn. */
  private updateStationCops(dt: number) {
    // Spawn: occasional cop traffic at a nearby station, skipped during the
    // bust/death cinematics — those sequences already fill the scene.
    this.stationCopSpawnTimer += dt;
    if (this.stationCopSpawnTimer >= 9 + Math.random() * 7) {
      this.stationCopSpawnTimer = 0;
      if (this.stationCops.length < 3 && this.bustedTitleTimer <= 0 && this.wastedTimer <= 0) {
        const stations = this.renderer.getPoliceStationsNear(this.carX, this.carZ, 260);
        if (stations.length > 0) {
          const st = stations[Math.floor(Math.random() * stations.length)];
          const sx = Math.sin(st.yaw), sc = Math.cos(st.yaw); // street-facing direction
          const doorX = st.x - sx * (st.hd + 1.4);
          const doorZ = st.z - sc * (st.hd + 1.4);
          const dist = 9 + Math.random() * 14;
          const off = (Math.random() - 0.5) * 9; // lateral spread along the facade
          const streetX = doorX + sx * dist - sc * off;
          const streetZ = doorZ + sc * dist + sx * off;
          const walkingIn = Math.random() < 0.5;
          const startX = walkingIn ? streetX : doorX;
          const startZ = walkingIn ? streetZ : doorZ;
          const targetX = walkingIn ? doorX : streetX;
          const targetZ = walkingIn ? doorZ : streetZ;
          const id = --this.stationCopIdCounter;
          this.stationCops.push({
            id,
            type: 'cop',
            gender: 'male',
            x: startX,
            z: startZ,
            yaw: Math.atan2(targetX - startX, targetZ - startZ),
            mesh: this.renderer.getPedestrianMesh('cop', id),
            health: 100,
            targetX,
            targetZ,
            walkingIn,
            linger: walkingIn ? 0.6 : 2 + Math.random() * 2,
          });
        }
      }
    }
    // Walk: move toward the target, linger briefly on arrival, then despawn.
    for (let i = this.stationCops.length - 1; i >= 0; i--) {
      const c = this.stationCops[i];
      if (Math.abs(c.x - this.carX) > 300 || Math.abs(c.z - this.carZ) > 300) { this.stationCops.splice(i, 1); continue; }
      const dx = c.targetX - c.x;
      const dz = c.targetZ - c.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.7) {
        c.linger -= dt;
        if (c.linger <= 0) this.stationCops.splice(i, 1);
        continue;
      }
      const targetYaw = Math.atan2(dx, dz);
      let yawDiff = targetYaw - c.yaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      c.yaw += yawDiff * Math.min(1, 5 * dt);
      const speed = c.walkingIn ? 1.7 : 1.4;
      c.x += Math.sin(c.yaw) * speed * dt;
      c.z += Math.cos(c.yaw) * speed * dt;
    }
  }
  private isAtAirportParkingSpot(x: number, z: number): boolean {
    for (const entry of GrandTheftRenderer.AIRPORT_ENTRY_ROADS) {
      const px = entry.gx * 80;
      const pz = entry.gzEnd * 80;
      if (Math.abs(x - px) < 5 && Math.abs(z - pz) < 5) return true;
    }
    return false;
  }
  private closestNode(x: number, z: number): number {
    let bestIdx = 0, bestDist = Infinity;
    for (let i = 0; i < this.trafficNodes.length; i++) {
      const d = (this.trafficNodes[i].x - x) ** 2 + (this.trafficNodes[i].z - z) ** 2;
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    return bestIdx;
  }
  private gameLoop = (now: number) => {
    // A render callback must never re-enter itself. This is a fail-safe for
    // browser/runtime callbacks that synchronously trigger another frame while
    // WebGL or Angular is unwinding an error.
    if (this._frameInProgress || this._destroyed) return;
    this._frameInProgress = true;
    // Clear the handle immediately: a stale RAF id can otherwise prevent the
    // finally block from scheduling the next frame after a synchronous callback.
    this.animFrameId = null;
    // Schedule the next frame only after the current callback has returned. Some
    // mobile/WebView RAF implementations invoke callbacks synchronously while
    // a frame is still being dispatched; scheduling here caused unbounded
    // gameLoop -> requestAnimationFrame recursion and a black screen.
    const rawDt = Math.min(Math.max((now - this.lastTime) / 1000, 0), 0.05);
    try {
    this.lastTime = now;
    // Brief slow-motion after a hard impact, easing back to real time.
    if (this.slowMoTimer > 0) {
      this.slowMoTimer -= rawDt;
      if (this.slowMoTimer <= 0) this.slowMoTimer = 0; // easing below ramps it back up
    } else {
      this.timeScale += (1 - this.timeScale) * Math.min(1, rawDt * 5);
    }
    const dt = rawDt * this.timeScale;
    if (this.crashShake > 0) this.crashShake = Math.max(0, this.crashShake - rawDt * 2.2);
    this._worldSaveTimer += dt;
    if (this._worldSaveTimer >= 3) {
      this._worldSaveTimer = 0;
      this.saveWorldState();
      this.savePlayerState();
    }
    if (!this.isLoaded) {
      this._hudUpdateTimer += dt;
      if (this._hudUpdateTimer > 0.1) {
        this._hudUpdateTimer = 0;
        this.ngZone.run(() => { });
      }
      return;
    }
    // A missed keyup (window blur, pointer-lock transition, or mobile browser
    // suspension) must never leave the player permanently frozen. Movement is
    // re-enabled immediately after the arrest/death cinematic has ended.
    if (this._arrested && this.bustCamTimer <= 0 && this.health > 0) this._arrested = false;
    if (this.health <= 0) {
      // Dead — freeze the body so the death cam stays centered on the corpse.
      // No movement, no vehicle updates; the render block below runs the pan.
      this.carVx = 0; this.carVz = 0; this.carSpeed = 0;
    } else if (this.taxiRideActive) {
      // Riding a taxi — the player rides inside until it stops, so no movement.
      this.carVx = 0; this.carVz = 0; this.carSpeed = 0;
    } else if (this.isPassenger) {
      this.updatePassengerFollow();
    } else if (this.isInCar && this.vehicleType === 'boat') this.updateBoat(dt);
    else if (this.isInCar && this.vehicleType === 'helicopter') this.updateHelicopter(dt);
    else if (this.isInCar && this.vehicleType === 'plane') this.updatePlane(dt);
    else if (this.isInCar && this.vehicleType === 'motorcycle') this.updateMotorcycle(dt);
    else if (this.isInCar) this.updateCar(dt);
    else this.updateWalking(dt);
    this.updateEngineAudio(dt);
    this.updateTrafficAudio(dt);
    this.updateStoreCashier(dt);
    this.updateCamera(dt);
    this.updateScore(dt);
    this.updateProjectiles(dt);
    this.updateRemoteShooting(dt);
    this.updateCopShooting();
    this.updatePassenger(dt);
    this._collisionTimer += dt;
    if (this._collisionTimer >= 0.1) {
      this._collisionTimer = 0;
      this.checkNearCar();
      this.checkNearVendingMachine();
      this.checkNearStore();
      this.checkNearOtherPlayerCar();
      this.updateVendingMachines();
      this.updateNPCCrashSounds();
    }
    this.showPassengerPrompt = this.canPickupPassenger();
    this.showPolicePrompt = this.isMobile && this.isInCar && this.vehicleType === 'police' && !this.policeMode;
    this.updateVehicleCollisions();
    this.updateExplosionJumps(dt);
    this.updateGarage(dt);
    this._lookTargetTimer += dt;
    if (this._lookTargetTimer >= 0.1) {  // 10 Hz instead of 60 Hz
      this._lookTargetTimer = 0;
      this.findLookTarget();
    }
    this._trafficTimer += dt;
    if (this._trafficTimer >= 0.033) { // ~30 FPS
      this.updateTraffic(this._trafficTimer);
      this._trafficTimer = 0;
    }
    this._pedTimer += dt;
    if (this._pedTimer >= 0.033) { // ~30 FPS
      this.updatePedestrians(this._pedTimer);
      this.updateStationCops(this._pedTimer);
      this._pedTimer = 0;
    }
    this.updateNPCInterpolation();
    this.updatePoliceSiren();
    this.updateTaxiRide(dt);
    this.updateTaxiMission(dt);
    this.updatePoliceMode(dt);
    this.updateEvictedCops(dt);
    this.updateDealershipMission(dt);
    this.updateAirportLotCars(dt);
    if (this.vehicleBannerTimer > 0) this.vehicleBannerTimer -= dt;
    if (this.wastedTimer > 0) this.wastedTimer -= dt;
    if (this.bustCamTimer > 0) this.bustCamTimer -= dt;
    if (this.damageAlpha > 0) this.damageAlpha = Math.max(0, this.damageAlpha - dt * 0.5);
    if (this.bustedFlashAlpha > 0) {
      this.bustedFlashAlpha = Math.max(0, this.bustedFlashAlpha - dt * 2.5);
      // The white flash is an *ngIf overlay and this loop runs outside Angular's
      // zone — a CD pass per frame while the flash is alive keeps the fade visible.
      this.ngZone.run(() => this.cdr.markForCheck());
    }
    if (this.bustedTitleTimer > 0) {
      this.bustedTitleTimer = Math.max(0, this.bustedTitleTimer - dt);
      // Unmount the *ngIf title (and its CSS fade) once the window is over.
      if (this.bustedTitleTimer === 0) this.ngZone.run(() => this.cdr.detectChanges());
    }
    if (this.murderFlashTimer > 0) this.murderFlashTimer -= dt;
    if (this.murderFlashAlpha > 0) this.murderFlashAlpha = Math.max(0, this.murderFlashAlpha - dt * 1.4);
    if (this.wantedPopTimer > 0) this.wantedPopTimer -= dt;
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
    // Locally parked cars are temporary world props, not a permanent cache.
    // Keep mission/garage vehicles exempt, but retire abandoned cars after a
    // generous lifetime or when they are far outside the active bubble.
    const parkedNow = performance.now() / 1000;
    this.parkedCars = this.parkedCars.filter(pc => {
      if (pc.health <= 0) return false;
      if (pc.id < 0 && !(this.dealershipMission && pc.id === this.dealershipMission.targetCarId)) {
        const parkedAt = (pc as any).parkedAt ?? parkedNow;
        (pc as any).parkedAt = parkedAt;
        const farAway = Math.hypot(pc.x - this.carX, pc.z - this.carZ) > 650;
        if (parkedNow - parkedAt > this.PARKED_CAR_LIFETIME_SECONDS || farAway) return false;
      }
      return true;
    });
    if (this.isInCar && this.carHealth > 0 && this.vehicleType !== 'boat' && this.vehicleType !== 'helicopter' && this.vehicleType !== 'plane') {
      const ocx = Math.floor(this.carX / 80), ocz = Math.floor(this.carZ / 80);
      // Water kills. Height alone misses two cases: the invisible road grid that
      // extends over the ocean (terrain there reads 0.0!) and rural lake beds.
      // So treat any ocean chunk and any spot inside a rural lake as water too.
      // Bridge decks are their own biome and ride above the waves, so they're
      // never swallowed by the biome check — only by the height check below
      // when the car actually falls off the deck into the water.
      const waterBiome = getBiome(ocx, ocz);
      const beachDepth = Math.max(0, -getTerrainHeight(this.carX, this.carZ, this.carY));
      // The beach shelf is shallow water, not an instant ocean kill zone. Let
      // the car nose into it and sink progressively as the terrain falls away.
      let inOcean = waterBiome === 'ocean' && beachDepth >= 2.0;
      if (!inOcean && waterBiome !== 'ocean' && getTerrainHeight(this.carX, this.carZ, this.carY) <= -2.0) inOcean = true;
      if (!inOcean && waterBiome === 'rural_lakes') {
        const lx = ((this.carX - ocx * 80) % 80 + 80) % 80;
        const lz = ((this.carZ - ocz * 80) % 80 + 80) % 80;
        // Lake visuals cover the central 40x40 of each lakes chunk
        if (Math.abs(lx - 40) <= 20 && Math.abs(lz - 40) <= 20) inOcean = true;
      }
      if (inOcean) {
        if (!this._carSubmerged) { this._carSubmerged = true; this._carSubmergeStart = performance.now() / 1000; }
        const subElapsed = (performance.now() / 1000) - this._carSubmergeStart;
        const subT = Math.min(subElapsed / 2.0, 1.0);
        const shelfSink = Math.min(1.8, beachDepth * 0.45);
        this.carY = CAR_HEIGHT - Math.max(subT * 2.4, shelfSink);
        if (subT >= 1.0 || beachDepth >= 2.4) {
          this.carHealth -= dt * 20;
        }
        if (this._carOnFire || this._carSmoking) {
          this._carFireX = this.carX;
          this._carFireZ = this.carZ;
          this._carFireYaw = this.carYaw;
        }
      } else {
        if (this._carSubmerged) { this._carSubmerged = false; this.carY = CAR_HEIGHT; }
        if (this.carHealth > CAR_SMOKE_HEALTH) { this._carSmoking = false; this._carSmokeStarted = 0; this._carSmokeBudget = CAR_SMOKE_SECONDS; }
        if (this.carHealth > 2) { this._carOnFire = false; this._carFireStarted = 0; }
      }
    }
    if (this.isInCar && this.carHealth > 0 && this.carHealth <= CAR_SMOKE_HEALTH && !this._carSmoking && !this._carOnFire && this._carSmokeBudget > 0) {
      this._carSmoking = true;
      this._carSmokeStarted = performance.now() / 1000;
    }
    if (this.isInCar && this.carHealth > 0 && !this._carSubmerged && this.carHealth <= 2 && !this._carOnFire) {
      this._carOnFire = true;
      this._carFireStarted = performance.now() / 1000;
    }
    if (this.isInCar && (this._carOnFire || this._carSmoking)) {
      this._carFireX = this.carX;
      this._carFireZ = this.carZ;
      this._carFireYaw = this.carYaw;
      if (this._carOnFire) {
        const fireElapsed = (performance.now() / 1000) - this._carFireStarted;
        if (fireElapsed >= 10.0) this.carHealth = 0;
      }
    }
    if (this.isInCar && this._carSmoking && !this._carOnFire) {
      // Total smoke budget: a car can emit smoke for at most 10 seconds per
      // life. Decrementing the budget (instead of just timing the episode)
      // stops the car from instantly re-triggering once the cap is reached.
      this._carSmokeBudget = Math.max(0, this._carSmokeBudget - dt);
      if (this._carSmokeBudget <= 0) {
        this._carSmoking = false;
        this._carSmokeStarted = 0;
      }
      this._carSmokeTimer += dt;
      if (this._carSmoking && this._carSmokeTimer > 0.15) {
        this._carSmokeTimer = 0;
        const sinY = Math.sin(this.carYaw), cosY = Math.cos(this.carYaw);
        const sx = this.carX + cosY * 0.8;
        const sz = this.carZ + sinY * 0.8;
        this.carSmoke.push({
          x: sx + (Math.random() - 0.5) * 0.6,
          y: 0.6 + Math.random() * 0.4,
          z: sz + (Math.random() - 0.5) * 0.6,
          vx: (Math.random() - 0.5) * 0.5,
          vy: 0.3 + Math.random() * 0.4,
          vz: (Math.random() - 0.5) * 0.5,
          size: 0.4 + Math.random() * 0.5,
          age: 0,
          lifetime: 2.0 + Math.random() * 1.5,
        });
      }
    }
    // Damage tracking: any drop in car health counts as combat and delays
    // idle regen. Diffing health catches every damage source in one place.
    if (this.isInCar && this.carHealth < this._lastCarHealth - 0.5) {
      this._carLastDamageTime = performance.now() / 1000;
    }
    if (this.isInCar) this._lastCarHealth = this.carHealth;

    // Repair shop: gas-station buildings act as service stations — pull up
    // next to one and the car is restored fast (blowing one up removes that
    // repair spot). Scanned on a short timer so the chunk query isn't run
    // every frame; the flag persists between scans so healing is smooth and
    // the hint doesn't flicker.
    this._repairScanTimer += dt;
    if (this._repairScanTimer >= 0.25) {
      this._repairScanTimer = 0;
      this.repairShopNearby = this.isInCar && this.carHealth > 0 && this.carHealth < CAR_MAX_HEALTH
        && !this._carOnFire && !this._carSubmerged
        && this.renderer.getNearbyGasStations(this.carX, this.carZ, REPAIR_SHOP_RANGE).length > 0;
      if (!this.repairShopNearby) {
        this.repairRemainingCost = 0;
        this.repairOutOfCash = false;
      }
    }
    if (this.repairShopNearby) {
      // Repairs cost money per HP restored (drawn from the cash balance, same
      // client-side pattern as the hooker drain). Out of cash, the wrench
      // stops turning until the player tops up.
      const missing = CAR_MAX_HEALTH - this.carHealth;
      this.repairRemainingCost = Math.ceil(missing * REPAIR_SHOP_COST_PER_HP);
      const heal = Math.min(missing, REPAIR_SHOP_RATE * dt);
      const affordableHp = Math.floor(this.money / REPAIR_SHOP_COST_PER_HP);
      const paid = Math.min(heal, affordableHp);
      if (paid > 0) {
        this.money -= Math.floor(paid * REPAIR_SHOP_COST_PER_HP);
        this.carHealth = Math.min(CAR_MAX_HEALTH, this.carHealth + paid);
      }
      this.repairOutOfCash = paid <= 0 && this.carHealth < CAR_MAX_HEALTH;
    }

    // Idle regen: after a few seconds out of combat the car slowly heals.
    // Crossing the smoke threshold re-arms the smoke budget (see the re-arm
    // check above), so a smoked-out car recovers once the fight is over.
    if (this.isInCar && this.carHealth > 0 && this.carHealth < CAR_MAX_HEALTH && !this._carOnFire && !this._carSubmerged
      && (performance.now() / 1000) - this._carLastDamageTime > CAR_REGEN_DELAY) {
      this.carHealth = Math.min(CAR_MAX_HEALTH, this.carHealth + CAR_REGEN_RATE * dt);
    }
    if (this.isInCar && this.carHealth <= 0) {
      this.spawnExplosion(this.carX, 0.5, this.carZ);
      this._carOnFire = false;
      this._carFireStarted = 0;
      this._carSubmerged = false;
      this.exitCar();
      this.carHealth = 200;
      this.carY = CAR_HEIGHT;
    }
    for (let i = this.parkedCars.length - 1; i >= 0; i--) {
      const pc = this.parkedCars[i];
      const now = performance.now() / 1000;
      if (pc.isBurning && pc.id < 0) {
        const elapsed = now - (pc.fireStarted ?? now);
        if (elapsed >= 10.0) {
          if (!this.deadNPCIds.has(pc.id)) {
            this.deadNPCIds.add(pc.id);
            this.spawnExplosion(pc.x, 0.5, pc.z);
          }
          this.parkedCars.splice(i, 1);
          continue;
        }
      }
      if (pc.isSmoking) {
        if (pc.smokeStarted && now - pc.smokeStarted >= 10.0) {
          pc.isSmoking = false;
          continue;
        }
        if ((this._parkedSmokeTimers?.[pc.id] ?? 0) < now - 0.15) {
          (this._parkedSmokeTimers ??= {})[pc.id] = now;
          const sinY = Math.sin(pc.yaw), cosY = Math.cos(pc.yaw);
          const sx = pc.x + cosY * 0.8;
          const sz = pc.z + sinY * 0.8;
          this.carSmoke.push({
            x: sx + (Math.random() - 0.5) * 0.6,
            y: 0.6 + Math.random() * 0.4,
            z: sz + (Math.random() - 0.5) * 0.6,
            vx: (Math.random() - 0.5) * 0.5,
            vy: 0.3 + Math.random() * 0.4,
            vz: (Math.random() - 0.5) * 0.5,
            size: 0.4 + Math.random() * 0.5,
            age: 0,
            lifetime: 2.0 + Math.random() * 1.5,
          });
        }
      }
    }
    // Smoke from damaged NPC cars (server-synced health/isSmoking) — per-car
    // throttle timer so effects don't re-trigger every poll ("recent smokes").
    const npcNow = performance.now() / 1000;
    for (const v of this.serverNPCs) {
      if (!v.isSmoking || v.health <= 0) {
        // Not smoking anymore — drop the anchor so a future smoke phase restarts fresh
        delete (this._npcSmokeStarted as any)[v.id];
        continue;
      }
      // "Recent smokes" timer: once smoke appears on a car, cap particle
      // emission at 10s — lingering smoke is heavy to render.
      if (this._npcSmokeStarted[v.id] === undefined) this._npcSmokeStarted[v.id] = npcNow;
      if (npcNow - this._npcSmokeStarted[v.id] >= 10) continue;
      if ((this._npcSmokeTimers?.[v.id] ?? 0) >= npcNow - 0.15) continue;
      (this._npcSmokeTimers ??= {})[v.id] = npcNow;
      const sinY = Math.sin(v.yaw), cosY = Math.cos(v.yaw);
      const sx = v.x + cosY * 0.8;
      const sz = v.z + sinY * 0.8;
      const smokeY = (v.type === 'helicopter' || v.type === 'plane') ? (v.y || 0) + 0.6 : 0.6;
      this.carSmoke.push({
        x: sx + (Math.random() - 0.5) * 0.6,
        y: smokeY + Math.random() * 0.4,
        z: sz + (Math.random() - 0.5) * 0.6,
        vx: (Math.random() - 0.5) * 0.5,
        vy: 0.3 + Math.random() * 0.4,
        vz: (Math.random() - 0.5) * 0.5,
        size: 0.4 + Math.random() * 0.5,
        age: 0,
        lifetime: 2.0 + Math.random() * 1.5,
      });
    }
    // Fleeing shot cars: tire screech + rear-wheel smoke for the first ~2.5s
    // of the panic, so the player hears and sees the getaway launch.
    for (const v of this.serverNPCs) {
      if (!v.isFleeing || v.health <= 0) {
        delete (this._npcFleeStarted as any)[v.id];
        continue;
      }
      if (this._npcFleeStarted[v.id] === undefined) this._npcFleeStarted[v.id] = npcNow;
      if (npcNow - this._npcFleeStarted[v.id] >= 2.5) continue;
      if ((this._npcFleeTimers?.[v.id] ?? 0) < npcNow - 0.12) {
        (this._npcFleeTimers ??= {})[v.id] = npcNow;
        const sinY = Math.sin(v.yaw), cosY = Math.cos(v.yaw);
        // Two puffs, one per rear wheel: back along the car + lateral spread.
        for (const side of [-0.7, 0.7]) {
          this.carSmoke.push({
            x: v.x - cosY * 1.3 - sinY * side + (Math.random() - 0.5) * 0.4,
            y: 0.25 + Math.random() * 0.25,
            z: v.z - sinY * 1.3 + cosY * side + (Math.random() - 0.5) * 0.4,
            vx: -cosY * (0.6 + Math.random() * 0.5) + (Math.random() - 0.5) * 0.3,
            vy: 0.25 + Math.random() * 0.35,
            vz: -sinY * (0.6 + Math.random() * 0.5) + (Math.random() - 0.5) * 0.3,
            size: 0.35 + Math.random() * 0.45,
            age: 0,
            lifetime: 0.9 + Math.random() * 0.8,
            // Light gray so it reads as fresh tire smoke, not dark engine smoke.
            colorR: 0.8, colorG: 0.8, colorB: 0.82,
          });
        }
        if (npcNow - this._lastScreechTime > 0.7) {
          this._lastScreechTime = npcNow;
          this.playTireScreech();
        }
      }
    }
    if (this.health <= 0) {
      if (!this._wasDead) {
        this._wasDead = true;
        this.wastedTimer = 3;
        // Cinematic death: the WASTED sting fires with the screen for symmetry
        // with the busted sequence (siren + BUSTED title).
        this.playWastedSting();
        this._deathCamX = this.carX;
        this._deathCamZ = this.carZ;
        this.dropMoneyAt(this.carX, this.carZ, this.money);
        this.money = 0;
        this.currentWeapon = 0;
        this.ownedWeapons = [true, false, false, false, false];
        this.ammo = [0, 0, 0, 0, 0];
        // Abort any taxi ride — you can't finish it while dead.
        this.taxiRideActive = false;
        this.taxiRideTaxi = null;
        this.taxiRideHidePlayer = false;
        this.showTaxiDestinations = false;
        // Cancel all active missions (car theft, taxi driver, police) — and
        // tell the player their job just died with them.
        const hadMission = !!(this.taxiMission || this.dealershipMission || this.policeMode);
        this.cancelAllMissions();
        if (hadMission) this.showMissionFailedToast('❌ MISSION FAILED');
        // Persist the reset right away (missions included) so a refresh during
        // the death-cam window can't resurrect money, weapons or a dead job.
        this.savePlayerState();
      }
      if (this._wasDead && !this._respawnTimer) {
        this._respawnTimer = setTimeout(() => {
          this.health = 100;
          this.carHealth = 200;
          this.wantedLevel = 0;
          this.evictedCops = [];
          if (this.isInCar) this.exitCar();
          if (this.isPassenger) this.exitPassenger();
          this.carX = HOSPITAL_SPAWN_X;
          this.carZ = HOSPITAL_SPAWN_Z;
          this.carY = CAR_HEIGHT;
          this.carYaw = HOSPITAL_SPAWN_YAW;
          this.carVx = 0;
          this.carVz = 0;
          this.carSpeed = 0;
          this.camYaw = HOSPITAL_SPAWN_YAW;
          this.camPitch = 0.2;
          this.camDist = 4;
          this.camHeight = 2;
          this.inStore = null;
          this.nearStoreRegister = false;
          this.nearStoreExit = false;
          this.nearStoreDoor = false;
          this._wasDead = false;
          this.wastedTimer = 0;
          this.bustCamTimer = 0;
          this._respawnTimer = null;
          this._justRespawned = true;
          setTimeout(() => { this._justRespawned = false; }, 3000);
        }, 3000);
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
        this.playCashPickup();
      }
    }
    if (this.showMap) this.drawMap();
    const canvas = this.canvasRef.nativeElement;
    const aspect = canvas.width / canvas.height;
    let targetX = this.carX, targetZ = this.carZ;
    let targetY = this.carY + (this.isInCar ? 0 : 1.2);
    let effectiveDist = this.camDist, effectiveHeight = this.camHeight;
    if (this.wastedTimer > 0 && this.health <= 0) {
      const deathProgress = 1 - Math.max(0, this.wastedTimer) / 3; // 0 → 1
      const eased = 1 - Math.pow(1 - deathProgress, 2); // ease-out climb
      effectiveDist = 6 + 16 * eased;        // pull back 6 → 22
      effectiveHeight = 3 + 11 * eased;      // rise 3 → 14
      targetX = this._deathCamX;
      targetZ = this._deathCamZ;
      targetY = this.carY + 0.5;             // keep the body in frame
      this.camPitch = 0.15 + 0.55 * eased;   // tilt down as we gain altitude
      this.camYaw += dt * 0.08;              // slow cinematic drift
    } else if (this.bustCamTimer > 0) {
      // Release pan from the station door: pull back, rise, and swing from the
      // off-axis peek to the normal behind-the-player chase cam.
      const panProgress = 1 - Math.max(0, this.bustCamTimer) / 1.8; // 0 → 1
      const eased = 1 - Math.pow(1 - panProgress, 3); // ease-out settle
      effectiveDist = 1.6 + (this.camDist - 1.6) * eased;     // back out of the door
      effectiveHeight = 0.9 + (this.camHeight - 0.9) * eased; // rise to chase height
      this.camPitch = 0.05 + (0.2 - 0.05) * eased;            // level → normal tilt
      this.camYaw = this._bustCamStartYaw - 0.5 * eased;      // settle behind the player
    } else if (this.firstPerson) {
      effectiveDist = 0; effectiveHeight = 0;
      targetY = this.carY + (this.isInCar ? 0.3 : 1.5);
    }
    // Decaying random camera shake after a hard impact.
    const shake = this.crashShake;
    const camX = targetX - Math.sin(this.camYaw) * effectiveDist + (Math.random() * 2 - 1) * shake * 0.9;
    const camZ = targetZ - Math.cos(this.camYaw) * effectiveDist + (Math.random() * 2 - 1) * shake * 0.9;
    const camY = targetY + effectiveHeight + (Math.random() * 2 - 1) * shake * 0.7;
    const renderMesh = this.isInCar ? this.playerVehicleMesh
      : ((this.firstPerson || (this.taxiRideActive && this.taxiRideHidePlayer)) ? null : this.renderer.playerMesh);
    // Dead entities are kept out of the visible lists. The death-detection
    // loop only prunes serverNPCs/serverPedestrians after a kill, but traffic,
    // airport, thug and local peds also carry health <= 0 entries after death
    // — leaving them in the draw lists would re-render them standing right
    // beside their corpse every frame, which reads as "killed and instantly
    // respawned".
    const notDead = (e: any) => e && e.health > 0 && !this.deadNPCIds.has(e.id);
    this._allNPCs.length = 0;
    for (const n of this.serverNPCs) if (notDead(n)) this._allNPCs.push(n);
    for (const n of this.trafficCars) if (notDead(n)) this._allNPCs.push(n);
    for (const n of this.airportLotCars) if (notDead(n)) this._allNPCs.push(n);
    for (const n of this.policeModeThugCars) if (notDead(n)) this._allNPCs.push(n);
    if (this.taxiRideActive && this.taxiRideTaxi && notDead(this.taxiRideTaxi)) this._allNPCs.push(this.taxiRideTaxi);
    this._allPeds.length = 0;
    for (const p of this.serverPedestrians) if (notDead(p)) this._allPeds.push(p);
    for (const p of this.localPedestrians) if (notDead(p)) this._allPeds.push(p);
    for (const c of this.stationCops) if (notDead(c)) this._allPeds.push(c);
    for (const p of this.policeModeThugPeds) if (notDead(p)) this._allPeds.push(p);
    for (const p of this.evictedCops) if (notDead(p)) this._allPeds.push(p);
    if (this.storeCashier && notDead(this.storeCashier)) this._allPeds.push(this.storeCashier);
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
    this.renderer.armOverrideActive = this.currentWeapon > 0 && !this.firstPerson;
    this.renderer.playerWeapon = this.currentWeapon;
    this.renderer.playerAttack = this.meleeAttack;
    this.renderer.playerAimPitch = this.camPitch;
    this.renderer.playerIsInCar = this.isInCar;
    // The renderer owns the visible local character. Keep its movement state
    // synchronized even when the player is walking on foot; otherwise the
    // model can remain at a stale/hidden pose after switching views or exiting
    // a vehicle.
    this.renderer.walkSpeed = this.isInCar ? 0 : Math.hypot(this.carVx, this.carVz);
    this.renderer.playerCarSpeed = this.isInCar ? this.carSpeed : 0;
    this.renderer.playerSteerInput = this._lastSteerInput;
    this.renderer.punchTime = this.punchTimer;
    if (this.punchTimer > 0) this.punchTimer = Math.max(0, this.punchTimer - dt);
    // Fix Y for on-foot other players so they stand on building roofs when applicable
    for (const op of this.otherPlayers) {
      if (!op.isInCar && !op.passengerOfUserId) {
        const opTerrainY = getTerrainHeight(op.posX, op.posZ);
        const opRoofY = this.getBuildingRoofY(op.posX, op.posZ);
        op.posY = opRoofY > opTerrainY ? opRoofY : opTerrainY;
      }
    }
    try {
      this.renderer.droppedWeapons = this.droppedWeapons || [];
      this.renderer.carFireElapsed = this._carOnFire ? (performance.now() / 1000) - this._carFireStarted : 0;
      const newChunkX = Math.floor(this.carX / CHUNK_SIZE);
      const newChunkZ = Math.floor(this.carZ / CHUNK_SIZE);
      if (newChunkX !== this._lastPreGenX || newChunkZ !== this._lastPreGenZ) {
        this._lastPreGenX = newChunkX;
        this._lastPreGenZ = newChunkZ;
        // Pre-generate all nearby chunks (synchronous but happens once per chunk crossing)
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            this.renderer.getCityChunk(newChunkX + dx, newChunkZ + dz);
          }
        }
      }
      if (!this._renderFaulted) this.renderer.render(
        camX, camY, camZ, this.camYaw, this.camPitch, aspect,
        targetX, this.carY - CAR_HEIGHT + rockOffset, targetZ, this.carYaw,
        this._allNPCs, this.otherPlayers, this._allPeds, this.parkedCars,
        dt,
        this.tracers, this.muzzleFlashes, this.rockets, this.explosions, this.bloodSplats,
        this.bloodPools,
        this.bulletSmoke,
        this.carSmoke,
        this.moneyStacks,
        this.deadBodies,
        this.vendingMachines,
        renderMesh,
        [...this.taxiMarkers, ...this.dealershipMarkers],
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
      if (!this._renderFaulted && this.firstPerson && !this.isInCar) {
        const anims = this.pickFirstPersonAnims();
        this.renderer.renderFirstPersonWeapon(
          camX, camY, camZ,
          this.camYaw, this.camPitch,
          this.currentWeapon,
          anims.mark23,
          dt
        );
        if (this._pistolDrawTimer > 0) this._pistolDrawTimer = Math.max(0, this._pistolDrawTimer - dt);
      }
    } catch (e) {
      this._renderFaultCount++;
      this._lastRenderErrorTime = performance.now();
      // A broken GLTF/WebGL scene is recorded once; it must not be retried in
      // the animation loop because the original exception is deterministic.
      // Rendering is optional, but repeatedly invoking a renderer that has
      // already overflowed the stack can keep the browser trapped in the same
      // failure path. Disable the render call for this component instance and
      // report the original exception only once.
      if (this._renderFaultCount === 1) console.error('render error', e);
      this._renderFaulted = true;
      if (this._renderRetryTimer !== null) {
        clearTimeout(this._renderRetryTimer);
        this._renderRetryTimer = null;
      }
      this._renderRetryPending = false;
    }
    if (this.damageAlpha > 0) {
      this.damageAlpha = Math.max(0, this.damageAlpha - dt * 1.5);
    }
    this.hudSpeed = Math.abs(this.carSpeed) * (this.isInCar ? 3.6 : 1);
    if (Math.abs(this.hudSpeed - this._lastHudSpeed) > 1 || this.health !== this._lastHealth) {
      this._lastHudSpeed = this.hudSpeed;
      this._lastHealth = this.health;
      // The game loop runs outside Angular. Schedule at most one UI refresh
      // per frame and never synchronously re-enter Angular while rendering.
      this.ngZone.run(() => this.cdr.markForCheck());
    }
    } finally {
      this._frameInProgress = false;
      if (!this._destroyed && this.animFrameId == null && this._renderRetryTimer == null) {
        this.scheduleNextFrame();
      }
    }
  };
  private startGameLoop(): void {
    if (this._destroyed || this.animFrameId !== null || this._renderSchedulePending) return;
    this._renderFaulted = false;
    this._renderSchedulePending = true;
    this.animFrameId = requestAnimationFrame((frameNow) => {
      this._renderSchedulePending = false;
      this.animFrameId = null;
      if (!this._destroyed) this.gameLoop(frameNow);
    });
  }
  private scheduleNextFrame(): void {
    if (this._destroyed || this._renderSchedulePending || this.animFrameId !== null || this._renderRetryTimer !== null) return;
    this._renderSchedulePending = true;
    this.animFrameId = requestAnimationFrame((frameNow) => {
      this._renderSchedulePending = false;
      this.animFrameId = null;
      if (!this._destroyed) this.gameLoop(frameNow);
    });
  }

  /** Busted: a cop booked the player — weapons are confiscated and the player
   *  wakes up at the nearest police station (home base if none is in range). */
  private doArrestRespawn() {
    this._arrested = false;
    this.health = 100;
    this.carHealth = 200;
    this.wantedLevel = 0;
    // Cinematic bust: a white camera flash pops, then the red vignette lingers
    // while the siren sting plays — GTA-style busted screen. The BUSTED title
    // slow-zooms in over the sting and fades out before the respawn.
    this.bustedFlashAlpha = 1;
    this.damageAlpha = 0.9;
    this.bustedTitleTimer = 3.2;
    this.playBustedSting();
    // Ambient police-radio chatter keeps the station scene alive behind the
    // sting — garbled voices trading transmissions for a few seconds.
    this.playStationRadioChatter();
    if (this.isInCar) this.exitCar();
    if (this.isPassenger) this.exitPassenger();
    this.currentWeapon = 0;
    this.ownedWeapons = [true, false, false, false, false];
    this.ammo = [0, 0, 0, 0, 0];
    const station = this.renderer.getNearestPoliceStation(this.carX, this.carZ, 800);
    let spawnYaw = HOME_BASE_YAW;
    if (station) {
      // Spawn at the station's front door, facing the street — never inside
      // the building footprint.
      const frontX = -Math.sin(station.yaw), frontZ = -Math.cos(station.yaw);
      this.carX = station.x + frontX * (station.hd + 1.4);
      this.carZ = station.z + frontZ * (station.hd + 1.4);
      spawnYaw = station.yaw;
    } else {
      this.carX = HOME_BASE_X;
      this.carZ = HOME_BASE_Z;
    }
    this.carY = CAR_HEIGHT;
    this.carYaw = spawnYaw;
    this.carVx = 0; this.carVz = 0; this.carSpeed = 0;
    this.camYaw = spawnYaw;
    this.camPitch = 0.2;
    this.camDist = 4;
    this.camHeight = 2;
    // Cinematic release: start close and low at the door, peeking slightly
    // off-axis, then pull back, rise and settle behind the player — the
    // respawn reads as a release instead of a teleport.
    this.bustCamTimer = 1.8;
    this._bustCamStartYaw = this.camYaw + 0.5;
    this._justRespawned = true;
    setTimeout(() => { this._justRespawned = false; }, 3000);
    const hadMission = !!(this.taxiMission || this.dealershipMission || this.policeMode);
    this.cancelAllMissions();
    if (hadMission) this.showMissionFailedToast('❌ MISSION FAILED');
    this.showStoreToast('🚨 BUSTED! Cops booked you — weapons confiscated');
    this.savePlayerState();
  }
  private updateWalking(dt: number) {
    // Busted: frozen in the cop's grip — no walking during the arrest hold.
    if (this._arrested) { this.carVx = 0; this.carVz = 0; this.carSpeed = 0; return; }
    let moveX = 0, moveZ = 0;
    if (this.isMobile && this.joystickActive) {
      moveX -= this.joystickX;
      moveZ += this.joystickY;
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
    const footTerrainY = getTerrainHeight(this.carX, this.carZ, this.carY, true);
    const footRoofY = this.getBuildingRoofY(this.carX, this.carZ);
    this.carY = CAR_HEIGHT + (footRoofY > footTerrainY ? footRoofY : footTerrainY);
    this.carSpeed = Math.sqrt(this.carVx * this.carVx + this.carVz * this.carVz);
    this.pushOutOfBuildings();
    if (!this.isInCar) this.pushPedestrianOutOfCars();
  }
  private updateCar(dt: number) {
    if (this._arrested) return; // can't drive away mid-arrest
    // Sports cars (lambo, countach, BRZ, challenger) are faster — a supercar
    // kick on top of the doubled base top speed.
    const sports = this.isSportsCarMesh(this.playerVehicleMesh);
    const accelBoost = sports ? 1.4 : 1;
    const surfaceBiome = getBiome(Math.floor(this.carX / CHUNK_SIZE), Math.floor(this.carZ / CHUNK_SIZE));
    const drivingOnSand = surfaceBiome === 'beach';
    const sandAccel = drivingOnSand ? 0.72 : 1;
    let accelForce = 0;
    let isReversing = false;
    if (this.keys.has('KeyW')) accelForce = 62 * accelBoost * sandAccel;
    if (this.keys.has('KeyS')) {
      if (this.carSpeed > 1) { accelForce = -60 * sandAccel; }
      else { isReversing = true; accelForce = -20 * sandAccel; }
    }
    let steer = 0;
    if (this.keys.has('KeyA')) steer = 1;
    if (this.keys.has('KeyD')) steer = -1;
    if (this.isMobile && this.joystickActive) {
      if (this.joystickY < 0.1) accelForce = 62 * accelBoost * sandAccel * this.joystickY;
      else if (this.joystickY > -0.1) {
        if (this.carSpeed > 1) { accelForce = -60 * sandAccel * (-this.joystickY); }
        else { isReversing = true; accelForce = -20 * sandAccel * (-this.joystickY); }
      }
      steer += -this.joystickX;
    }
    const speedFactor = Math.min(1, Math.abs(this.carSpeed) / 5);
    const steerDir = this.carSpeed < -0.5 ? -1 : 1;
    this._lastSteerInput = steer;
    const steerRate = drivingOnSand ? 2.0 : 2.5;
    this.carYaw += steer * steerRate * dt * speedFactor * steerDir;
    if (accelForce !== 0) {
      this.carVx += Math.sin(this.carYaw) * accelForce * dt;
      this.carVz += Math.cos(this.carYaw) * accelForce * dt;
    }
    const forwardX = Math.sin(this.carYaw), forwardZ = Math.cos(this.carYaw);
    const rightX = Math.cos(this.carYaw), rightZ = -Math.sin(this.carYaw);
    let fwdSpeed = this.carVx * forwardX + this.carVz * forwardZ;
    let latSpeed = this.carVx * rightX + this.carVz * rightZ;
    // Sand absorbs more engine momentum and offers much less lateral grip than
    // asphalt. Keeping lateral velocity is what makes the car wash out and
    // slide instead of pivoting cleanly through every turn.
    const forwardDrag = drivingOnSand ? 1.35 : 0.55;
    fwdSpeed *= Math.max(0, 1 - forwardDrag * dt);
    const isHandbraking = this.keys.has('Space');
    const grip = isHandbraking ? (drivingOnSand ? 0.75 : 1.5) : (drivingOnSand ? 3.2 : 12.0);
    latSpeed *= Math.max(0, 1 - grip * dt);
    this.carVx = fwdSpeed * forwardX + latSpeed * rightX;
    this.carVz = fwdSpeed * forwardZ + latSpeed * rightZ;
    const maxSpd = isReversing
      ? (drivingOnSand ? 14 : 20)
      : (drivingOnSand ? (sports ? 105 : 84) : (sports ? 140 : 110));
    const currentSpd = Math.hypot(this.carVx, this.carVz);
    if (currentSpd > maxSpd) {
      this.carVx = (this.carVx / currentSpd) * maxSpd;
      this.carVz = (this.carVz / currentSpd) * maxSpd;
    }
    this.carSpeed = fwdSpeed;
    // Hard braking or handbrake at speed → tire screech (throttled).
    if ((this.keys.has('KeyS') || this.keys.has('Space')) && Math.abs(this.carSpeed) > 8) {
      const nowT = performance.now();
      if (nowT - this._lastBrakeScreech > 550) {
        this._lastBrakeScreech = nowT;
        this.playTireScreech();
      }
    }
    this.carX += this.carVx * dt;
    this.carZ += this.carVz * dt;
    // The bridge height is resolved by the normal terrain pass below. Do not
    // force an unconditional deck snap here: side-wall impacts can place the
    // car inside the bridge's broad world range but outside its road corridor.
    // That old force-deck sample teleported those cars onto the roadway.
    this.updateJumpPhysics(dt);
    this.pushOutOfBuildings();
    this.checkPropCollision();
  }
  // ── Jump ramps: drive over a ramp at speed to go airborne; landing scores ──
  private updateJumpPhysics(dt: number) {
    const groundY = CAR_HEIGHT + getTerrainHeight(this.carX, this.carZ, this.carY, true);
    if (this.jumpActive) {
      this.jumpAirtime += dt;
      this.jumpVy -= JUMP_GRAVITY * dt;
      this.carY += this.jumpVy * dt;
      const aboveGround = this.carY - (CAR_HEIGHT + getTerrainHeight(this.carX, this.carZ, this.carY, true));
      if (aboveGround > this.jumpPeak) this.jumpPeak = aboveGround;
      const dist = Math.hypot(this.carX - this.jumpLaunchX, this.carZ - this.jumpLaunchZ);
      const readout = `AIRBORNE ${Math.max(0, Math.floor(dist))}m · ${Math.max(0, Math.floor(this.jumpPeak * 10) / 10)}m up`;
      if (readout !== this.jumpReadout) {
        this.jumpReadout = readout;
        this.ngZone.run(() => this.cdr.markForCheck());
      }
      if (this.carY <= groundY) {
        this.carY = groundY;
        this.jumpActive = false;
        if (this.jumpReadout !== '') {
          this.jumpReadout = '';
          this.ngZone.run(() => this.cdr.markForCheck());
        }
        const landDist = Math.hypot(this.carX - this.jumpLaunchX, this.carZ - this.jumpLaunchZ);
        if (landDist >= JUMP_MIN_DIST && this.jumpRampId > 0) {
          this.submitJump(this.jumpRampId, landDist, this.jumpPeak, this.jumpLaunchSpeed);
        }
        this.jumpRampId = 0;
        this.jumpPeak = 0;
        this.jumpAirtime = 0;
        this.jumpVy = 0;
      }
      return;
    }
    // On the ground: keep following terrain (critical — don't early-return
    // before setting carY, or cars stop tracking sidewalks/bridges/beaches).
    this.carY = groundY;
    if (this.jumpReadout !== '') {
      this.jumpReadout = '';
      this.ngZone.run(() => this.cdr.markForCheck());
    }
    const spd = Math.hypot(this.carVx, this.carVz);
    if (this.jumpCooldown > 0) { this.jumpCooldown -= dt; return; }
    if (spd < 8) return;
    for (const r of JUMP_RAMPS) {
      const sinY = Math.sin(r.yaw), cosY = Math.cos(r.yaw);
      const along = (this.carX - r.x) * sinY + (this.carZ - r.z) * cosY;
      const lat = (this.carX - r.x) * cosY - (this.carZ - r.z) * sinY;
      if (Math.abs(along) < 6.5 && Math.abs(lat) < 3.5) {
        const alongVel = this.carVx * sinY + this.carVz * cosY;
        if (alongVel >= 8) {
          this.jumpActive = true;
          this.jumpRampId = r.id;
          this.jumpLaunchX = this.carX;
          this.jumpLaunchZ = this.carZ;
          this.jumpLaunchSpeed = spd;
          this.jumpVy = Math.min(5 + spd * 0.18, 12);
          this.jumpPeak = 0;
          this.jumpAirtime = 0;
          this.jumpCooldown = 1.5;
        }
        break;
      }
    }
  }
  private async submitJump(rampId: number, distance: number, height: number, launchSpeed: number) {
    const uid = this.getUserId();
    if (!uid) return;
    const res: any = await this.gtService.submitJump(uid, rampId, Math.round(distance * 10) / 10, Math.round(height * 10) / 10);
    if (res && res.ok && res.isRecord && res.reward > 0) {
      this.money += res.reward;
      this.moneyStacks.push({ x: this.carX, z: this.carZ, amount: res.reward, yaw: 0, age: 0, lifetime: 5 });
      this.showJumpToast(`🏆 JUMP RECORD! ${res.distance}m (+$${res.reward})`);
      if (this.lbTab === 'jumps') this.loadJumps();
    } else if (res && res.ok) {
      // Non-record stunt bonus: a high-speed landing still pays distance-scaled
      // cash, but only once per ramp per session so it can't be farmed.
      const bonus = launchSpeed >= JUMP_BONUS_MIN_SPEED && !this.jumpBonusClaimed.has(rampId)
        ? Math.min(25 + Math.round(distance * 2), JUMP_BONUS_MAX)
        : 0;
      if (bonus > 0) {
        this.jumpBonusClaimed.add(rampId);
        this.money += bonus;
        this.moneyStacks.push({ x: this.carX, z: this.carZ, amount: bonus, yaw: 0, age: 0, lifetime: 5 });
        this.showJumpToast(`🛹 STUNT BONUS! ${Math.round(distance)}m (+$${bonus})`);
      } else {
        this.showJumpToast(`JUMP ${distance}m · best ${res.bestDistance}m`);
      }
    }
  }
  private showJumpToast(msg: string) {
    this.jumpToast = msg;
    if (this._jumpToastTimer) clearTimeout(this._jumpToastTimer);
    this._jumpToastTimer = setTimeout(() => { this.jumpToast = ''; }, 4500);
  }
  private showTrophyToast(msg: string) {
    this.trophyToast = msg;
    if (this._trophyToastTimer) clearTimeout(this._trophyToastTimer);
    this._trophyToastTimer = setTimeout(() => { this.trophyToast = ''; }, 5000);
  }
  private showMissionFailedToast(msg: string) {
    this.missionFailedToast = msg;
    if (this._missionFailedToastTimer) clearTimeout(this._missionFailedToastTimer);
    this._missionFailedToastTimer = setTimeout(() => { this.missionFailedToast = ''; }, 5000);
  }
  private async loadJumps() {
    if (this._destroyed) return;
    const reqId = ++this._hsReqId;
    const res = await this.gtService.getJumps(this.getUserId());
    if (this._destroyed || reqId !== this._hsReqId) return;
    this.jumpRampData = res?.ramps ?? [];
  }
  trackByJump(index: number, item: { id: number }): number {
    return item ? item.id : index;
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
    if (spd >= 15) {
      const gs = this.renderer.getGasStationAtPoint(this.carX, this.carZ);
      if (gs) {
        const key = `${gs.x},${gs.z}`;
        if (!this.renderer.explodedGasStations.has(key)) {
          this.renderer.explodedGasStations.add(key);
          this.renderer.explodedGasStationTimers.set(key, performance.now());
          this.spawnGasStationExplosion(gs.x, gs.z);
          this.carHealth = 0;
        }
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
    this._lastSteerInput = steer;
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
    // Hard braking or handbrake at speed → tire screech (throttled).
    if ((this.keys.has('KeyS') || this.keys.has('Space')) && Math.abs(this.carSpeed) > 8) {
      const nowT = performance.now();
      if (nowT - this._lastBrakeScreech > 550) {
        this._lastBrakeScreech = nowT;
        this.playTireScreech();
      }
    }
    this.carX += this.carVx * dt;
    this.carZ += this.carVz * dt;
    // Resolve bridge height only after horizontal collision correction. The
    // terrain sampler limits bridge elevation to the actual deck corridor, so
    // a car stopped against the side wall remains at the lower terrain level
    // rather than being lifted onto the bridge.
    this.carY = CAR_HEIGHT + getTerrainHeight(this.carX, this.carZ, this.carY);
    this.pushOutOfBuildings();
    this.checkPropCollision();
  }
  /** True when the player is driving one of the fast sports models (the
   *  index-constant entries of the renderer's car pool: Lambo, Countach,
   *  BRZ, Challenger) rather than a commuter sedan/pickup. */
  private isSportsCarMesh(mesh: CityMesh | CityMesh[] | null): boolean {
    if (!mesh) return false;
    const list = this.renderer.carMeshes;
    if (!list.length) return false;
    const m0 = Array.isArray(mesh) ? mesh[0] : mesh;
    for (const idx of [0, 1, 6, 7]) {
      const sports = list[idx];
      if (!sports || !sports.length) continue;
      if (sports[0] === m0) return true;
    }
    return false;
  }
  private updateBoat(dt: number) {
    const accel = 15, maxSpeed = 35, turnSpeed = 1.5;
    const ocx = Math.floor(this.carX / 80), ocz = Math.floor(this.carZ / 80);
    const biome = getBiome(ocx, ocz);
    const onWater = biome === 'ocean' || (biome === 'bridge' && getTerrainHeight(this.carX, this.carZ, this.carY) <= -2.0);
    const forwardX = Math.sin(this.carYaw), forwardZ = Math.cos(this.carYaw);

    if (onWater) {
      let accelForce = 0;
      if (this.keys.has('KeyW')) accelForce = accel;
      if (this.keys.has('KeyS')) accelForce = -accel;
      if (this.isMobile && this.joystickActive) {
        accelForce = accel * this.joystickY;
      }
      if (accelForce !== 0) {
        this.carVx += forwardX * accelForce * dt;
        this.carVz += forwardZ * accelForce * dt;
      }

      let steer = 0;
      if (this.keys.has('KeyA')) steer = 1;
      if (this.keys.has('KeyD')) steer = -1;
      if (this.isMobile && this.joystickActive) steer += -this.joystickX;
      const spd = Math.hypot(this.carVx, this.carVz);
      if (spd > 0.5) this.carYaw += steer * turnSpeed * dt * Math.min(1, spd / 5);
      const drag = 0.3;
      this.carVx *= Math.max(0, 1 - drag * dt);
      this.carVz *= Math.max(0, 1 - drag * dt);

      const currentSpd = Math.hypot(this.carVx, this.carVz);
      if (currentSpd > maxSpeed) {
        this.carVx = (this.carVx / currentSpd) * maxSpeed;
        this.carVz = (this.carVz / currentSpd) * maxSpeed;
      }
    } else {
      // Boats may carry momentum onto shore, but throttle and steering cannot
      // add motion there. The dry-land drag brings them smoothly to a stop.
      const landDrag = Math.max(0, 1 - 2.0 * dt);
      this.carVx *= landDrag;
      this.carVz *= landDrag;
      if (Math.hypot(this.carVx, this.carVz) < 0.05) {
        this.carVx = 0;
        this.carVz = 0;
      }
    }

    this.carX += this.carVx * dt;
    this.carZ += this.carVz * dt;
    this.carSpeed = Math.hypot(this.carVx, this.carVz);
    this.carY = CAR_HEIGHT;
  }
  private updateHelicopter(dt: number) {
    const maxSpeed = 35, climbRate = 12, yawSpeed = 2.0, turnSpeed = 2.5;
    // A helicopter sitting on the ground can't pivot in place — it must be
    // airborne (above the minimum altitude) before it can turn at all.
    const heliRoofY = this.getBuildingRoofY(this.carX, this.carZ);
    const heliFloorY = CAR_HEIGHT + getTerrainHeight(this.carX, this.carZ, this.carY);
    const heliMinY = heliRoofY > heliFloorY ? heliRoofY : heliFloorY;
    const grounded = this.carY <= heliMinY + 0.15;
    if (!this._heliCtx) this.initHeliAudio();
    this.updateHeliAudio(dt, grounded);
    if (!grounded) {
      if (this.isMobile && this.joystickActive) {
        if (Math.abs(this.joystickX) > 0.1) this.carYaw -= this.joystickX * turnSpeed * dt;
      } else {
        if (this.keys.has('KeyA')) this.carYaw += turnSpeed * dt;
        if (this.keys.has('KeyD')) this.carYaw -= turnSpeed * dt;
      }
    }
    if (this.altUpPressed) this.carVy = Math.min(this.carVy + climbRate * dt, 10);
    else if (this.altDownPressed) this.carVy = Math.max(this.carVy - climbRate * dt, -10);
    else {
      // Idle at zero airspeed: no translational lift, so the rotor can't hold
      // altitude — slowly and gradually settle toward the ground instead of
      // hovering in place forever. Once grounded (or if input returns), the
      // normal decay/clamp takes over.
      const idleSpeed = Math.hypot(this.carVx, this.carVz);
      if (idleSpeed < 1.0 && this.carY > heliMinY + 0.2) {
        this.carVy = Math.max(this.carVy - 2.0 * dt, -2.5);
      } else {
        this.carVy *= 0.92;
      }
    }
    let fwdInput = 0;
    if (this.isMobile && this.joystickActive) {
      if (Math.abs(this.joystickY) > 0.1) fwdInput = this.joystickY;
    } else {
      if (this.keys.has('KeyW')) fwdInput = 1;
      if (this.keys.has('KeyS')) fwdInput = -1;
    }
    // A grounded rotor can't push the airframe sideways — ignore throttle
    // input until the skids lift off, and bleed off any residual drift.
    if (grounded) {
      fwdInput = 0;
      this.carVx *= Math.max(0, 1 - 8 * dt);
      this.carVz *= Math.max(0, 1 - 8 * dt);
    }
    this.carPitch = -fwdInput * 0.25;
    const forwardX = Math.sin(this.carYaw), forwardZ = Math.cos(this.carYaw);
    const targetVx = forwardX * fwdInput * maxSpeed;
    const targetVz = forwardZ * fwdInput * maxSpeed;
    this.carVx += (targetVx - this.carVx) * Math.min(1, 3 * dt);
    this.carVz += (targetVz - this.carVz) * Math.min(1, 3 * dt);
    if (!grounded) {
      if (this.keys.has('KeyQ')) this.carYaw -= yawSpeed * dt;
      if (this.keys.has('KeyE')) this.carYaw += yawSpeed * dt;
    }
    this.carX += this.carVx * dt;
    this.carZ += this.carVz * dt;
    this.carY += this.carVy * dt;
    this.carSpeed = Math.hypot(this.carVx, this.carVz);
    if (this.carY < heliMinY) { this.carY = heliMinY; this.carVy = Math.max(0, this.carVy); }
  }
  // ---- Helicopter rotor audio (procedural Web Audio) ----
  // A low sawtooth pair through a lowpass, amplitude-modulated by a slow LFO
  // for the blade-beat "wop wop". Spools up while grounded + climbing, idles
  // faintly on the ground, and silences once airborne so takeoff sounds
  // distinct from cruise.
  private initHeliAudio() {
    if (this._heliCtx) return;
    try {
      const ctx = new AudioContext();
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch { } }
      this._heliCtx = ctx;
      this._heliFilter = ctx.createBiquadFilter();
      this._heliFilter.type = 'lowpass';
      this._heliFilter.frequency.value = 180;
      this._heliFilter.Q.value = 1.5;
      this._heliGain = ctx.createGain();
      this._heliGain.gain.value = 0;
      this._heliFilter.connect(this._heliGain);
      this._heliGain.connect(ctx.destination);
      this._heliOsc = ctx.createOscillator();
      this._heliOsc.type = 'sawtooth';
      this._heliOsc.frequency.value = 24;
      this._heliOsc.connect(this._heliFilter);
      this._heliOsc2 = ctx.createOscillator();
      this._heliOsc2.type = 'sawtooth';
      this._heliOsc2.frequency.value = 48;
      this._heliOsc2.detune.value = 9;
      const o2g = ctx.createGain();
      o2g.gain.value = 0.45;
      this._heliOsc2.connect(o2g);
      o2g.connect(this._heliFilter);
      // Slow LFO amplitude-modulates the master gain → the blade-beat "wop wop"
      this._heliLfo = ctx.createOscillator();
      this._heliLfo.type = 'sine';
      this._heliLfo.frequency.value = 6;
      this._heliLfoGain = ctx.createGain();
      this._heliLfoGain.gain.value = 0;
      this._heliLfo.connect(this._heliLfoGain);
      this._heliLfoGain.connect(this._heliGain.gain);
      this._heliOsc.start();
      this._heliOsc2.start();
      this._heliLfo.start();
    } catch (e) {
      this._heliCtx = null;
    }
  }
  private updateHeliAudio(dt: number, grounded: boolean) {
    if (!this._heliCtx) return;
    if (this._heliCtx.state === 'suspended') { try { this._heliCtx.resume(); } catch { } }
    // Grounded + throttle held → spool up; grounded idle → faint thrum;
    // airborne → silence.
    const climbing = this.altUpPressed;
    const target = grounded ? (climbing ? 1 : 0.18) : 0;
    this._heliSpool += (target - this._heliSpool) * Math.min(1, 4 * dt);
    const s = this._heliSpool;
    if (this._heliOsc) this._heliOsc.frequency.value = 22 + s * 24;
    if (this._heliOsc2) this._heliOsc2.frequency.value = 44 + s * 48;
    if (this._heliFilter) this._heliFilter.frequency.value = 140 + s * 400;
    if (this._heliGain) this._heliGain.gain.value = s * 0.09 * this.carSfxVolume;
    if (this._heliLfo) this._heliLfo.frequency.value = 5 + s * 5;
    if (this._heliLfoGain) this._heliLfoGain.gain.value = s * 0.03;
  }
  private stopHeliAudio() {
    try {
      for (const o of [this._heliOsc, this._heliOsc2, this._heliLfo]) {
        if (o) { try { o.stop(); } catch { } try { o.disconnect(); } catch { } }
      }
      if (this._heliGain) { try { this._heliGain.disconnect(); } catch { } }
      if (this._heliFilter) { try { this._heliFilter.disconnect(); } catch { } }
      if (this._heliLfoGain) { try { this._heliLfoGain.disconnect(); } catch { } }
      if (this._heliCtx) { try { this._heliCtx.close(); } catch { } }
    } catch (e) { }
    this._heliCtx = null; this._heliOsc = null; this._heliOsc2 = null;
    this._heliFilter = null; this._heliGain = null; this._heliLfo = null;
    this._heliLfoGain = null; this._heliSpool = 0;
  }
  private updatePlane(dt: number) {
    const maxSpeed = 70, minSpeed = 5, turnSpeed = 1.2;
    const pitchSpeed = 1.8, rollSpeed = 1.8, altClimbRate = 15;
    if (this.isMobile && this.joystickActive) {
      if (Math.abs(this.joystickY) > 0.1) this.carPitch = Math.max(-0.6, Math.min(0.6, this.carPitch - this.joystickY * pitchSpeed * dt));
      else if (!this.isPointerLocked) this.carPitch *= 0.95;
      if (Math.abs(this.joystickX) > 0.1) this.carRoll = Math.max(-0.8, Math.min(0.8, this.carRoll + this.joystickX * rollSpeed * dt));
      else this.carRoll *= Math.max(0, 1 - 2.0 * dt);
    } else {
      if (this.keys.has('KeyW')) this.carPitch = Math.max(-0.6, this.carPitch - pitchSpeed * dt);
      if (this.keys.has('KeyS')) this.carPitch = Math.min(0.6, this.carPitch + pitchSpeed * dt);
      if (!this.keys.has('KeyW') && !this.keys.has('KeyS') && !this.isPointerLocked) {
        this.carPitch *= 0.95;
      }
      if (this.keys.has('KeyA')) this.carRoll = Math.max(-0.8, this.carRoll - rollSpeed * dt);
      if (this.keys.has('KeyD')) this.carRoll = Math.min(0.8, this.carRoll + rollSpeed * dt);
      if (!this.keys.has('KeyA') && !this.keys.has('KeyD')) {
        this.carRoll *= Math.max(0, 1 - 2.0 * dt);
      }
    }
    const bankFactor = this.carRoll * 1.5;
    this.carYaw += bankFactor * turnSpeed * dt * Math.min(1, this.carSpeed / 20);
    const sinPitch = Math.sin(this.carPitch);
    const cosPitch = Math.cos(this.carPitch);
    // No auto-throttle: the plane only starts moving when the player gives
    // input (W/S pitch, Space/Shift climb, or the joystick). Parked on the
    // runway it sits still until you press up.
    const hasInput = this.altUpPressed || this.altDownPressed
      || this.keys.has('KeyW') || this.keys.has('KeyS')
      || (this.isMobile && this.joystickActive);
    const targetSpeed = maxSpeed * (0.5 + 0.5 * cosPitch);
    if (hasInput) {
      if (this.carSpeed < targetSpeed) this.carSpeed = Math.min(this.carSpeed + 12 * dt, targetSpeed);
      else if (this.carSpeed > targetSpeed) this.carSpeed = Math.max(this.carSpeed - 8 * dt, targetSpeed);
      if (this.altUpPressed) {
        this.carVy = Math.min(this.carVy + altClimbRate * dt, 10);
      } else if (this.altDownPressed) {
        this.carVy = Math.max(this.carVy - altClimbRate * dt, -10);
      } else {
        const speed = this.carSpeed;
        const lift = speed * speed * cosPitch * 0.006;
        const thrustVy = speed * sinPitch * 0.3;
        this.carVy += (lift + thrustVy - 5 - this.carVy * 0.5) * dt;
      }
    } else {
      // Idle: hold the current airspeed and ease vertical speed to zero so the
      // plane cruises level instead of falling — no need to hold it up.
      this.carVy *= Math.max(0, 1 - 2.0 * dt);
      // Slow planes settle: decay toward a stop so landing is possible without
      // a brake key (glide in slow, release, roll to a halt).
      if (this.carSpeed < 15) this.carSpeed = Math.max(0, this.carSpeed - 10 * dt);
    }
    if (this.carSpeed < minSpeed && this.carPitch < -0.05) {
      this.carVy += (-5 * 1.5) * dt;
    }
    const forwardX = Math.sin(this.carYaw), forwardZ = Math.cos(this.carYaw);
    this.carX += forwardX * this.carSpeed * dt;
    this.carZ += forwardZ * this.carSpeed * dt;
    this.carY += this.carVy * dt;
    const planeRoofY = this.getBuildingRoofY(this.carX, this.carZ);
    const planeFloorY = CAR_HEIGHT + getTerrainHeight(this.carX, this.carZ, this.carY);
    const planeMinY = planeRoofY > planeFloorY ? planeRoofY : planeFloorY;
    if (this.carY < planeMinY) {
      if (this.carSpeed > minSpeed && Math.abs(this.carPitch) > 0.3) {
        this.carHealth -= 50 * dt;
      }
      this.carY = planeMinY;
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
        this.checkTreesInChunk(chunkCX, chunkCZ, margin);
      }
    }
  }
  private checkTreesInChunk(chunkCX: number, chunkCZ: number, margin: number) {
    // Trees are solid obstacles: you can't drive (or walk) straight through
    // them. Trees are stored as { x, z, yaw, scale } with the whole visual
    // scaled by `scale`, so the blast/block radius scales with the model. The
    // car is pushed out radially and slowed like a building hit.
    const chunk = this.renderer.getCityChunk(chunkCX, chunkCZ);
    for (const tree of chunk.trees) {
      const r = 1.4 + (tree.scale ?? 0) * 0.28 + margin;
      const dx = this.carX - tree.x;
      const dz = this.carZ - tree.z;
      const dist = Math.hypot(dx, dz);
      if (dist >= r || dist < 0.0001) continue;
      const overlap = r - dist;
      this.carX += (dx / dist) * overlap;
      this.carZ += (dz / dist) * overlap;
      if (this.isInCar) {
        const treeSpd = Math.hypot(this.carVx, this.carVz);
        if (treeSpd >= 9) {
          const nowT = performance.now();
          if (nowT - this._lastTreeHitTime > 450) {
            this._lastTreeHitTime = nowT;
            this.playCrashSound(Math.min(1, treeSpd / 28));
            this.applyCrashImpact(Math.min(1, treeSpd / 28));
          }
        }
        this.carVx *= 0.3;
        this.carVz *= 0.3;
        this.carSpeed *= 0.5;
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
  /**
   * Solid footprint (and top height) of one building mesh, shared by the
   * collision push and roof-height logic. Most buildings are solid across
   * their whole mesh bounds, but the procedural gas station is mostly open
   * air — a canopy on columns over a drive-through forecourt — so only its
   * rear service building blocks movement. Players and pedestrians can then
   * walk, and cars drive, through the forecourt instead of hitting an
   * invisible box spanning the entire station.
   */
  private buildingSolidRect(bld: any, m: any, margin: number): { cx: number; cz: number; hw: number; hd: number; topY: number } | null {
    const rs = m.renderScale ?? 1;
    const sx = (bld.scale?.[0] ?? 1) * rs;
    const sy = (bld.scale?.[1] ?? 1) * rs;
    const sz = (bld.scale?.[2] ?? 1) * rs;
    const fullHw = (m.maxX - m.minX) / 2 * sx + margin;
    const fullHd = (m.maxZ - m.minZ) / 2 * sz + margin;
    if (!m.carName || !m.carName.includes('gas_station')) {
      return {
        cx: bld.x, cz: bld.z, hw: fullHw, hd: fullHd,
        topY: bld.y + (m.minY !== undefined && m.maxY !== undefined ? (m.maxY - m.minY) * sy : 0),
      };
    }
    // Rear service building in createGasStationMesh: box(0, 3.5, 13, 24, 7, 7)
    // → half-extents 12×3.5 centered at local (0, 13), roof top at local y 7.
    // The sign pylon sits inside this footprint; canopy, columns, and pumps
    // stay passable. Stations are generated axis-aligned (yaw 0); for any
    // other rotation keep the conservative full footprint rather than
    // mis-rotating the sub-box.
    const rot = ((bld.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const flip = Math.abs(rot - Math.PI) < 0.01 ? -1 : 1;
    if (flip > 0 && Math.abs(bld.yaw) > 0.01) {
      return { cx: bld.x, cz: bld.z, hw: fullHw, hd: fullHd, topY: bld.y + 7 * sy };
    }
    return {
      cx: bld.x,
      cz: bld.z + flip * 13 * sz,
      hw: 12 * sx + margin,
      hd: 3.5 * sz + margin,
      topY: bld.y + 7 * sy,
    };
  }
  private checkBuildingsInChunk(chunkCX: number, chunkCZ: number, margin: number) {
    const chunk = this.renderer.getCityChunk(chunkCX, chunkCZ);
    for (const bld of chunk.buildings) {
      // Don't shove the player out of the store they're currently inside.
      if (this.inStore && bld.x === this.inStore.x && bld.z === this.inStore.z) continue;
      const models = Array.isArray(bld.model) ? bld.model : [bld.model];
      for (const m of models) {
        if (m.minX === undefined || m.maxX === undefined || m.minZ === undefined || m.maxZ === undefined) continue;
        const solid = this.buildingSolidRect(bld, m, margin);
        if (!solid) continue;
        const dx = this.carX - solid.cx;
        const dz = this.carZ - solid.cz;
        if (Math.abs(dx) < solid.hw && Math.abs(dz) < solid.hd && this.carY < 15) {
          if (this.isInCar) {
            const wallSpd = Math.hypot(this.carVx, this.carVz);
            const nowW = performance.now();
            if (wallSpd >= 9 && nowW - this._lastWallCrashTime > 450) {
              this._lastWallCrashTime = nowW;
              const wallSeverity = Math.min(1, wallSpd / 28);
              this.playCrashSound(wallSeverity);
              this.applyCrashImpact(wallSeverity);
              // Smashing into a gas station at speed blows it up — the blast
              // ruins the station for the cooldown and punishes the car hard.
              if (wallSpd >= 14 && m.carName && m.carName.includes('gas_station')) {
                const gKey = `${bld.x},${bld.z}`;
                if (!this.renderer.explodedGasStations.has(gKey)) {
                  this.renderer.explodedGasStations.add(gKey);
                  this.renderer.explodedGasStationTimers.set(gKey, nowW);
                  this.spawnGasStationExplosion(bld.x, bld.z);
                }
              }
            }
          }
          const overlapX = solid.hw - Math.abs(dx), overlapZ = solid.hd - Math.abs(dz);
          if (overlapX < overlapZ) { this.carX += dx > 0 ? overlapX : -overlapX; this.carVx *= -0.3; }
          else { this.carZ += dz > 0 ? overlapZ : -overlapZ; this.carVz *= -0.3; }
          this.carSpeed *= 0.5;
        }
      }
    }
  }
  private getBuildingRoofY(x: number, z: number): number {
    // Inside a store you walk on the floor, never up onto the roof.
    if (this.inStore) return -Infinity;
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    let roofY = -Infinity;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk = this.renderer.getCityChunk(cx + dx, cz + dz);
        for (const bld of chunk.buildings) {
          const models = Array.isArray(bld.model) ? bld.model : [bld.model];
          for (const m of models) {
            if (m.minX === undefined || m.maxX === undefined || m.minZ === undefined || m.maxZ === undefined || m.minY === undefined || m.maxY === undefined) continue;
            const solid = this.buildingSolidRect(bld, m, 0);
            if (!solid) continue;
            const dx2 = x - solid.cx, dz2 = z - solid.cz;
            if (Math.abs(dx2) < solid.hw && Math.abs(dz2) < solid.hd) {
              if (solid.topY > roofY) roofY = solid.topY;
            }
          }
        }
      }
    }
    return roofY;
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
  /**
   * Grocery-store entry: while inside, the register is at the store centre and
   * the exit is at the front door. Outside, detect the closest supermarket's
   * front door (models face -Z, so the street side is -sin(yaw), -cos(yaw)).
   */
  private checkNearStore() {
    if (this.isInCar || this.isPassenger) {
      this.nearStoreDoor = false;
      this.nearStoreRegister = false;
      this.nearStoreExit = false;
      return;
    }
    if (this.inStore) {
      const st = this.inStore;
      const regX = this.getStoreRegisterX(st), regZ = this.getStoreRegisterZ(st);
      const regDx = this.carX - regX, regDz = this.carZ - regZ;
      const distToCenter = Math.hypot(this.carX - st.x, this.carZ - st.z);
      // Wandered out of the building (e.g. past the door while walking): exit in
      // place so store mode can't soft-lock the player with a tight camera.
      if (distToCenter > st.hd + 6) {
        this.leaveStoreInPlace();
        return;
      }
      // The register is at the checkout counter, not the store centre — in the
      // convenience store that's offset toward the front wall (+8, -5 local),
      // so the stick-up happens at the counter where the cashier stands.
      this.nearStoreRegister = Math.hypot(regDx, regDz) < STORE_REGISTER_DIST;
      const exDx = this.carX - st.doorX, exDz = this.carZ - st.doorZ;
      this.nearStoreExit = Math.sqrt(exDx * exDx + exDz * exDz) < STORE_EXIT_DIST;
      this.nearStoreDoor = false;
      return;
    }
    this.nearStoreRegister = false;
    this.nearStoreExit = false;
    // Freshly left a store: don't immediately re-offer entry at the door.
    if (Date.now() < this._storeLeaveUntil) {
      this.nearStoreDoor = false;
      this._nearStore = null;
      return;
    }
    let best: { x: number; z: number; yaw: number; hd: number; doorX: number; doorZ: number; key: string; isConvenience?: boolean } | null = null;
    let bestD = Infinity;
    for (const sm of this.renderer.getNearbySupermarkets(this.carX, this.carZ, STORE_LOOK_RADIUS)) {
      const frontX = -Math.sin(sm.yaw), frontZ = -Math.cos(sm.yaw);
      const doorX = sm.x + frontX * (sm.hd + 1.4);
      const doorZ = sm.z + frontZ * (sm.hd + 1.4);
      const d = Math.hypot(doorX - this.carX, doorZ - this.carZ);
      if (d < bestD) {
        bestD = d;
        best = { x: sm.x, z: sm.z, yaw: sm.yaw, hd: sm.hd, doorX, doorZ, key: `${sm.x},${sm.z}`, isConvenience: sm.isConvenience };
      }
    }
    this._nearStore = best;
    this.nearStoreDoor = !!best && bestD < STORE_ENTER_DIST;
  }
  // World-space checkout register position for a store. The procedural
  // convenience store's counter sits (+8, -5) in local space (front-right of the
  // building, where the register mesh is drawn); every other store keeps the
  // register at its centre.
  private getStoreRegisterX(sm: { x: number; z: number; yaw: number; hd: number; isConvenience?: boolean }): number {
    const lx = sm.isConvenience ? 8 : 0, lz = sm.isConvenience ? -5 : 0;
    const sinY = Math.sin(sm.yaw), cosY = Math.cos(sm.yaw);
    return sm.x + (lx * cosY + lz * sinY);
  }
  private getStoreRegisterZ(sm: { x: number; z: number; yaw: number; hd: number; isConvenience?: boolean }): number {
    const lx = sm.isConvenience ? 8 : 0, lz = sm.isConvenience ? -5 : 0;
    const sinY = Math.sin(sm.yaw), cosY = Math.cos(sm.yaw);
    return sm.z + (-lx * sinY + lz * cosY);
  }
  private enterStore(sm: { x: number; z: number; yaw: number; hd: number; doorX: number; doorZ: number; key: string; isConvenience?: boolean }) {
    if (this.isInCar || this.isPassenger) return;
    this.renderer.convenienceStoreDoorOpen = true;
    const frontX = -Math.sin(sm.yaw), frontZ = -Math.cos(sm.yaw);
    // Step in and stand ~1.8 units off the back wall, facing the register.
    this.inStore = sm;
    this.carX = sm.x - frontX * Math.max(1.2, sm.hd - 1.8);
    this.carZ = sm.z - frontZ * Math.max(1.2, sm.hd - 1.8);
    this.carYaw = sm.yaw;
    this.carVx = 0; this.carVz = 0; this.carSpeed = 0;
    this._savedCamDist = this.camDist;
    this._savedCamHeight = this.camHeight;
    this.camDist = STORE_INTERIOR_CAM_DIST;
    this.camHeight = STORE_INTERIOR_CAM_HEIGHT;
    this.nearStoreDoor = false;
    this.nearStoreExit = false;
    // Spawn the cashier behind the register (at the checkout counter, not in the
    // aisles), facing the register. It stays put until the register is stuck
    // up, then sprints for the door.
    const cashierId = --this.pedIdCounter;
    const cashierGender = Math.random() < 0.5 ? 'female' : 'male';
    // The store interior lies opposite the street-facing front, so the cashier
    // stands just inside the counter on the far side from the aisle.
    const sinY = Math.sin(sm.yaw), cosY = Math.cos(sm.yaw);
    const regX = this.getStoreRegisterX(sm), regZ = this.getStoreRegisterZ(sm);
    this.storeCashier = {
      id: cashierId,
      x: regX + sinY * 0.6,
      z: regZ + cosY * 0.6,
      yaw: sm.yaw + Math.PI,
      gender: cashierGender,
      mesh: this.renderer.getPedestrianMesh(cashierGender, cashierId),
      speed: 0,
      panicUntil: 0,
      doorX: sm.doorX,
      doorZ: sm.doorZ,
    };
  }
  private leaveStore() {
    if (!this.inStore) return;
    this.renderer.convenienceStoreDoorOpen = false;
    const st = this.inStore;
    this.inStore = null;
    this.storeCashier = null;
    this.carX = st.doorX - Math.sin(st.yaw) * 1.5;
    this.carZ = st.doorZ - Math.cos(st.yaw) * 1.5;
    this.carYaw = st.yaw + Math.PI; // face the street
    this._storeLeaveUntil = Date.now() + 1500;
    this.carVx = 0; this.carVz = 0; this.carSpeed = 0;
    this.camDist = this._savedCamDist || 4;
    this.camHeight = this._savedCamHeight || 2;
    this.nearStoreRegister = false;
    this.nearStoreExit = false;
    this.nearStoreDoor = false;
    this._nearStore = null;
  }
  private leaveStoreInPlace() {
    if (!this.inStore) return;
    this.renderer.convenienceStoreDoorOpen = false;
    this.inStore = null;
    this.storeCashier = null;
    this.renderer.convenienceStoreDoorOpen = false;
    this.camDist = this._savedCamDist || 4;
    this.camHeight = this._savedCamHeight || 2;
    this.nearStoreRegister = false;
    this.nearStoreExit = false;
    this.nearStoreDoor = false;
    this._nearStore = null;
    this._storeLeaveUntil = Date.now() + 1500;
  }
  private robStore() {
    if (!this.inStore) return;
    if (this.currentWeapon <= 0) {
      this.showStoreToast('🔫 Pull out a weapon to stick up the register');
      return;
    }
    const key = this.inStore.key;
    const now = Date.now();
    const last = this.renderer.supermarketLastPayout.get(key) || 0;
    if (now - last < STORE_ROB_COOLDOWN_MS) {
      const mins = Math.ceil((STORE_ROB_COOLDOWN_MS - (now - last)) / 60000);
      this.showStoreToast(`🕐 Register's already cleaned out — come back in ${mins} min`);
      return;
    }
    this.renderer.supermarketLastPayout.set(key, now);
    const payout = 5000 + Math.floor(Math.random() * 5001);
    // No instant wallet credit — the cash spills onto the floor as pickup-able
    // stacks (walk over them to collect, ching on pickup).
    this.dropMoneyAt(this.inStore.x, this.inStore.z, payout);
    // The cashier panics and sprints out the front door.
    if (this.storeCashier) {
      this.storeCashier.panicUntil = performance.now() / 1000 + 6;
    }
    // An armed stick-up is a witnessed crime — raise the wanted level so cops
    // dispatch to the store (server records the store as last known sighting).
    this.gtService.reportRobbery(this.getUserId(), this.inStore.x, this.inStore.z).then((res: any) => {
      if (res && res.wantedLevel !== undefined) {
        this.wantedLevel = res.wantedLevel;
        this.wantedPopTimer = 0.7; // wanted-star pop
      }
    });
    this.showStoreToast(`💰 STUCK UP! $${payout.toLocaleString()} spilled — grab it!`);
  }
  /** Moves the store cashier: idle at the register, sprint to the door when panicked. */
  private updateStoreCashier(dt: number) {
    const c = this.storeCashier;
    if (!c) return;
    const nowSec = performance.now() / 1000;
    if (c.panicUntil > 0 && nowSec < c.panicUntil) {
      const dx = c.doorX - c.x;
      const dz = c.doorZ - c.z;
      const dist = Math.hypot(dx, dz);
      c.yaw = Math.atan2(dx, dz);
      const runSpeed = 4.2;
      c.speed = runSpeed;
      if (dist < 1.0) {
        // Reached the door — ran out of the store.
        this.storeCashier = null;
        return;
      }
      c.x += Math.sin(c.yaw) * runSpeed * dt;
      c.z += Math.cos(c.yaw) * runSpeed * dt;
      return;
    }
    if (c.panicUntil > 0) {
      // Panic window ended without reaching the door — despawn.
      this.storeCashier = null;
      return;
    }
    c.speed = 0;
  }
  private showStoreToast(msg: string) {
    this.storeToast = msg;
    if (this._storeToastTimer) clearTimeout(this._storeToastTimer);
    this._storeToastTimer = setTimeout(() => { this.storeToast = ''; }, 4500);
  }
  /**
   * Entry distance for a decorative aircraft (plane/helicopter). These are also
   * registered as buildings for collision, and the collision box is derived from
   * the model bounds × renderScale — which is much wider than ENTER_CAR_DIST for
   * a plane (scale 2.25). Using the fixed 4-unit radius meant the player was
   * pushed out of the plane's collision box before ever reaching the entry
   * threshold, making planes impossible to enter. Match the real footprint so
   * the player can walk up to the body and get in.
   */
  private aircraftEnterDist(da: any): number {
    const models = Array.isArray(da.model) ? da.model : [da.model];
    let maxHalf = 0;
    for (const m of models) {
      if (!m || m.minX === undefined || m.maxX === undefined || m.minZ === undefined || m.maxZ === undefined) continue;
      const rs = m.renderScale ?? 1;
      const hw = (m.maxX - m.minX) / 2 * rs;
      const hd = (m.maxZ - m.minZ) / 2 * rs;
      maxHalf = Math.max(maxHalf, hw, hd);
    }
    return Math.max(ENTER_CAR_DIST, maxHalf + 1.5);
  }
  private checkNearCar() {
    if (this.isInCar || this.isPassenger) { this.nearCar = false; this.nearTaxi = false; this.taxiEntrySide = null; return; }
    this.nearCar = [...this.serverNPCs, ...this.parkedCars].some(v => v.health > 0 && Math.sqrt((v.x - this.carX) ** 2 + (v.z - this.carZ) ** 2) < ENTER_CAR_DIST);
    // Standing next to a taxi: the front doors (driver/passenger) steal it,
    // the back doors hail it as a passenger ride.
    const nearbyTaxi = this.getNearbyTaxi();
    this.nearTaxi = nearbyTaxi !== null;
    this.taxiEntrySide = nearbyTaxi
      ? ((this.carX - nearbyTaxi.x) * Math.sin(nearbyTaxi.yaw) + (this.carZ - nearbyTaxi.z) * Math.cos(nearbyTaxi.yaw)) > 0 ? 'front' : 'back'
      : null;
    if (!this.nearCar) {
      const cxa = Math.floor(this.carX / 80), cza = Math.floor(this.carZ / 80);
      for (let dza = -1; dza <= 1; dza++) {
        for (let dxa = -1; dxa <= 1; dxa++) {
          const chunk = this.renderer.getCityChunk(cxa + dxa, cza + dza);
          if (chunk.decorativeAircraft.some(da => Math.hypot(da.x - this.carX, da.z - this.carZ) < this.aircraftEnterDist(da))) {
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
    // Check supermarket robbery (outside only — inside is handled by the register)
    if (this.currentWeapon > 0 && !this.isInCar && !this.inStore) {
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
            // Same floor-spill behavior as the interior register stick-up.
            this.dropMoneyAt(sm.x, sm.z, payout);
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
      const vy = (v as any).posY ?? (v as any).y ?? 0;
      const dy = Math.abs(this.carY - vy);
      if (dy > 3) continue;
      const dx = this.carX - v.x;
      const dz = this.carZ - v.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const minDist = carRadius * 2;
      if (dist < minDist && dist > 0.01) {
        if (actualSpeed >= 6) {
          const impactSeverity = Math.min(1, actualSpeed / 28);
          this.playCrashSound(impactSeverity);
          this.applyCrashImpact(impactSeverity);
        }
        const overlap = minDist - dist;
        const nx = dx / dist;
        this.carX += nx * overlap * 0.5;
        this.carVx *= -0.3; this.carVz *= -0.3;
        this.carSpeed = Math.hypot(this.carVx, this.carVz);
        v.health -= collisionDamage;
        this.carHealth -= collisionDamage * 0.5;
      }
    }
    const runOverSeen = new Set<number>();
    for (const ped of [...this.serverPedestrians, ...this.localPedestrians]) {
      if (ped.health <= 0) continue;
      if (runOverSeen.has(ped.id)) continue;
      runOverSeen.add(ped.id);
      const isLocal = (ped as any).waitTimer !== undefined;
      const pdx = this.carX - ped.x;
      const pdz = this.carZ - ped.z;
      const pdist = Math.sqrt(pdx * pdx + pdz * pdz);
      // Same height guard as the car-vs-car loop — peds are on the ground, so
      // aircraft flying overhead can't 'run over' crowds below.
      const dy = Math.abs(this.carY - ((ped as any).posY ?? 0));
      if (dy > 3) continue;
      if (pdist < 2.0) {
        if (actualSpeed >= 4) this.playCrashSound(0.22);
        const impactForce = Math.max(2, actualSpeed * 0.5);
        const angle = Math.atan2(ped.z - this.carZ, ped.x - this.carX);
        const hitSpeed = Math.max(4, actualSpeed);
        const knockback = hitSpeed * 0.65;
        ped.x += Math.cos(angle) * impactForce;
        ped.z += Math.sin(angle) * impactForce;
        // Preserve a short ragdoll-like aftermath: the renderer uses this
        // impulse to rotate and lift the procedural body instead of snapping it
        // directly from walking to a static corpse.
        this.npcImpactReactions.set(ped.id, {
          vx: Math.cos(angle) * knockback,
          vz: Math.sin(angle) * knockback,
          spin: (Math.random() - 0.5) * hitSpeed * 0.08,
          age: 0,
          duration: hitSpeed >= 14 ? 0.85 : 0.5,
        });
        ped.health -= Math.max(18, Math.min(70, 18 + actualSpeed * 1.5));
        this.spawnBlood(ped.x, 1.0, ped.z, Math.cos(angle), 0.2, Math.sin(angle));
        if (actualSpeed >= 8) {
          this.spawnBlood(ped.x, 1.25, ped.z, Math.cos(angle), 0.35, Math.sin(angle), true);
        }
        this.score += 10;
        // Report the hit (weapon 0 = vehicle) so server peds track the damage
        // and every lethal run-over draws heat; local peds need the kill flag
        // since the server never registered them.
        this.gtService.hit(this.getUserId(), ped.id, 1, 25, this.carX, this.carZ, 0);
        if (isLocal && ped.health <= 0) {
          this.gtService.hit(this.getUserId(), ped.id, 1, 25, this.carX, this.carZ, 0, true);
          this.showMurderFlash();
        }
        if (ped.health <= 0) {
          if (!isLocal) {
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
  }
  private updateCamera(_dt: number) {
    if (this.isInCar && !this.firstPerson) {
      const timeSinceMouse = performance.now() - this.lastMouseMoveTime;
      if (this.vehicleType === 'helicopter') {
        if (timeSinceMouse > 1500) {
          let yawDiff = this.carYaw - this.camYaw;
          while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
          while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
          this.camYaw += yawDiff * 0.05;
        }
      } else if (this.carSpeed < 0) {
        if (timeSinceMouse > 1500) {
          const targetYaw = this.carYaw + Math.PI;
          let yawDiff = targetYaw - this.camYaw;
          while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
          while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
          this.camYaw += yawDiff * 0.05;
        }
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
        const ny = (npc as any).posY ?? (npc as any).y ?? 0;
        if (Math.abs(ny - r.y) > 4) continue;
        if (Math.sqrt((npc.x - r.x) ** 2 + (npc.z - r.z) ** 2) < 2) { hit = true; break; }
      }
      if (hit || r.age >= r.lifetime) {
        this.spawnExplosion(r.x, r.y, r.z);
        this.rockets.splice(i, 1);
      }
    }
    this.explosions = this.explosions.filter(e => (e.age += dt) < e.lifetime);
    this.bloodPools = this.bloodPools.filter(bp => (bp.age += dt) < bp.lifetime);
    for (const s of this.bulletSmoke) {
      s.age += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      s.vy -= 1.0 * dt;
      s.size += 1.5 * dt;
    }
    this.bulletSmoke = this.bulletSmoke.filter(s => s.age < s.lifetime);
    for (const s of this.carSmoke) {
      s.age += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      s.vy -= 0.3 * dt;
      s.size += 0.8 * dt;
    }
    this.carSmoke = this.carSmoke.filter(s => s.age < s.lifetime);
    const now = performance.now() / 1000;
    this.deadBodies = this.deadBodies.filter(db => (now - db.deathTime) < db.lifetime);
    for (const [id, reaction] of this.npcImpactReactions) {
      reaction.age += dt;
      reaction.vx *= Math.max(0, 1 - dt * 4.5);
      reaction.vz *= Math.max(0, 1 - dt * 4.5);
      if (reaction.age >= reaction.duration) this.npcImpactReactions.delete(id);
    }
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
        this.playWeaponSound(4, this.getShotVolumeScale(p.posX, p.posZ));
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
        this.spawnBulletSmoke(p.posX, originY, p.posZ, rdirX, rdirY, rdirZ, p.weapon);
        this.spawnBulletTrail(p.posX, originY, p.posZ, rdirX, rdirY, rdirZ, p.weapon);
        this.playWeaponSound(p.weapon, this.getShotVolumeScale(p.posX, p.posZ));
      }
    }
  }
  private updateCopShooting() {
    const checkNPC = (npc: any) => {
      if (npc.type !== 'cop' && npc.type !== 'police' && npc.type !== 'helicopter' && npc.type !== 'ped_male' && npc.type !== 'ped_female') return;
      if (!npc.isShootingAt) return;
      const dx = this.carX - npc.x;
      const dz = this.carZ - npc.z;
      const targetY = this.carY + 1.0;
      const dy = targetY - 1.2;
      const d3 = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (npc.type === 'helicopter') {
        if (d3 > 0.01) {
          this.tracers.push({ originX: npc.x, originY: npc.y, originZ: npc.z, dirX: dx / d3, dirY: dy / d3, dirZ: dz / d3, age: 0, lifetime: 0.12 });
          this.muzzleFlashes.push({ x: npc.x, y: npc.y, z: npc.z, dirX: dx / d3, dirY: dy / d3, dirZ: dz / d3, weapon: 2, age: 0, lifetime: 0.08 });
          this.spawnBulletSmoke(npc.x, npc.y, npc.z, dx / d3, dy / d3, dz / d3, 1);
          this.spawnBulletTrail(npc.x, npc.y, npc.z, dx / d3, dy / d3, dz / d3, 2);
        }
        this.playWeaponSound(2, this.getShotVolumeScale(npc.x, npc.z));
      } else if (npc.type === 'cop' || npc.type === 'police') {
        if (d3 > 0.01) {
          this.tracers.push({
            originX: npc.x, originY: 1.2, originZ: npc.z,
            dirX: dx / d3, dirY: dy / d3, dirZ: dz / d3,
            age: 0, lifetime: 0.1
          });
          this.muzzleFlashes.push({
            x: npc.x, y: 1.2, z: npc.z,
            dirX: dx / d3, dirY: dy / d3, dirZ: dz / d3,
            weapon: 2, age: 0, lifetime: 0.08
          });
          this.spawnBulletSmoke(npc.x, 1.2, npc.z, dx / d3, dy / d3, dz / d3, 1);
          this.spawnBulletTrail(npc.x, 1.2, npc.z, dx / d3, dy / d3, dz / d3, 1);
        }
        // NPC gunfire uses the rifle shot (weapon 2); weapon 0 is Unarmed and silent.
        this.playWeaponSound(2, this.getShotVolumeScale(npc.x, npc.z));
        // Occasionally a round whizzes past — the ricochet zing sells the danger.
        // Distant shooters zing less often as well as quieter.
        const zingScale = this.getShotVolumeScale(npc.x, npc.z);
        if (Math.random() < 0.4 * zingScale) this.playRicochetZing(zingScale);
      } else if (d3 > 0.01) {
        // Melee: a punched ped lands a punch. If it's swinging at another ped
        // (targetNpcId set), the connect effects land on that ped — a small
        // blood puff at its position and a flinch — so ped-on-ped brawls read
        // visibly. Otherwise the target is the player: puff at the hit point
        // plus the hurt flash and camera jolt, like local-ped punches.
        this.renderer.triggerPunch(npc.id);
        const pedTarget = this.findServerPedById(npc.meleeTargetId);
        if (pedTarget) {
          const pdx = pedTarget.x - npc.x, pdz = pedTarget.z - npc.z;
          const pd = Math.hypot(pdx, pdz) || 1;
          this.spawnBlood(pedTarget.x, 1.2, pedTarget.z, pdx / pd, 0, pdz / pd, true);
          this.renderer.triggerFlinch(pedTarget.id);
        } else {
          this.spawnBlood(this.carX, this.carY + 1.0, this.carZ, dx / d3, dy / d3, dz / d3, true);
          this.damageAlpha = 0.45;
          this.crashShake = Math.max(this.crashShake, 0.12);
          // The damage vignette is an *ngIf overlay and this loop runs outside
          // Angular's zone — without an explicit CD pass the flash decays to
          // zero before any poll triggers change detection, so it never shows.
          // Force it like the HUD throttle so the flash fires with the thud.
          // The game loop runs outside Angular. Schedule at most one UI refresh
      // per frame and never synchronously re-enter Angular while rendering.
      this.ngZone.run(() => this.cdr.markForCheck());
        }
        // The body-blow thud only when the fight is near the player (a distant
        // ped-on-ped scrum shouldn't thud at full volume from across town).
        if (d3 < 30) this.playPunchThud();
      }
      npc.isShootingAt = false;
    };
    for (const npc of this.serverNPCs) checkNPC(npc);
    for (const ped of this.serverPedestrians) checkNPC(ped);
  }
  /** Look up a server-simulated ped by id in either list (for melee targets). */
  private findServerPedById(id?: number): any {
    if (!id) return null;
    return this.serverNPCs.find(n => n.id === id) || this.serverPedestrians.find(p => p.id === id) || null;
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
  private initTraffic() {
    this.trafficNodes = this.renderer.getRoadNodesInRadius(
      Math.floor(this.carX / CHUNK_SIZE), Math.floor(this.carZ / CHUNK_SIZE), 30
    );
    this.trafficEdges = this.renderer.getRoadEdges(this.trafficNodes);
    this.rebuildLanes();
    if (this.trafficNodes.length < 2) {
      console.warn('Grand Theft traffic delayed: no usable road nodes yet');
      return;
    }
    for (let i = 0; i < 25; i++) {
      this.spawnTrafficCar();
    }
  }
  private trySpawnAirportLotCars() {
    if (this._destroyed) return; // mirror the hospital-lot retry: stop once the component is gone
    if (this.renderer.carMeshes.length > 0) {
      this.spawnAirportLotCars();
    } else {
      setTimeout(() => this.trySpawnAirportLotCars(), 1000);
    }
  }
  private spawnAirportLotCars() {
    if (this.renderer.carMeshes.length === 0) return;
    const dealerships: { gx: number; gz: number }[] = [
      { gx: 12, gz: -6 }, { gx: 26, gz: -8 },
    ];
    const parkingLots: { gx: number; gz: number }[] = [
      { gx: 2, gz: -3 }, { gx: 41, gz: -11 }, { gx: 39, gz: 16 },
    ];
    let spawned = 0;
    for (const pl of parkingLots) {
      if (spawned >= 2) break;
      const lotX = pl.gx * 80;
      const lotZ = pl.gz * 80;
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
    for (const dl of dealerships) {
      const lotX = dl.gx * 80;
      const lotZ = dl.gz * 80;
      const npcId = --this.pedIdCounter;
      this.dealershipNPCs.push({
        id: npcId,
        x: lotX + 18,
        z: lotZ + 25,
        yaw: -Math.PI / 2,
        mesh: this.renderer.getPedestrianMesh('male', npcId),
        lotGx: dl.gx,
        lotGz: dl.gz,
      });
      for (let di = 0; di < 3; di++) {
        const sx = lotX + (di - 1) * 9;
        const sz = lotZ + 18;
        if (this.isSpotOccupied(sx, sz)) continue; // restored car already there
        const color = [0.3 + Math.random() * 0.5, 0.3 + Math.random() * 0.5, 0.3 + Math.random() * 0.5];
        const parkedId = --this.pedIdCounter;
        this.parkedCars.push({
          id: parkedId,
          x: sx,
          z: sz,
          yaw: 0,
          type: 'car',
          health: 1000,
          mesh: this.renderer.getNPCCarMesh([color[0], color[1], color[2]], parkedId),
          colorR: color[0], colorG: color[1], colorB: color[2],
        });
      }
    }
  }
  // The hospital sits on a painted parking_lot chunk, with a second painted lot
  // just across the road to the west — but parking lots never spawn cars, so the
  // stalls stayed empty while cars clustered on the surrounding roads. Fill the
  // lot next to the hospital with client-side parked cars: negative ids survive
  // the server's parked-car merge each poll and they can be stolen like any
  // other parked car (dealership cars use the same pattern).
  private trySpawnHospitalParkingCars() {
    if (this._destroyed) return;
    if (this.renderer.carMeshes.length === 0) {
      setTimeout(() => this.trySpawnHospitalParkingCars(), 1000);
      return;
    }
    this.fillParkingLotChunk(-1, 0); // the painted lot across the road west of the hospital
  }
  // Parks cars on a parking_lot chunk's painted stalls, mirroring the renderer's
  // stall grid: 5 rows (the middle row is the drive aisle), 7 stalls per row,
  // stall 3 wide x 5 deep, rows spaced 6 apart.
  private fillParkingLotChunk(gx: number, gz: number) {
    const blockWorldX = gx * 80 + 40;
    const blockWorldZ = gz * 80 + 40;
    const baseId = -Date.now();
    let n = 0;
    for (let row = 0; row < 5; row++) {
      if (row === 2) continue; // center aisle — keep it driveable
      const rz = blockWorldZ - 14 + row * 6;
      for (let col = 0; col < 7; col++) {
        if (Math.random() < 0.45) continue; // ~55% occupancy looks lived-in
        const rx = blockWorldX - 9 + col * 3;
        if (this.isSpotOccupied(rx, rz)) continue; // restored car already there
        const color = [0.3 + Math.random() * 0.5, 0.3 + Math.random() * 0.5, 0.3 + Math.random() * 0.5];
        const parkedId = baseId - n;
        this.parkedCars.push({
          id: parkedId,
          x: rx,
          z: rz,
          yaw: row < 2 ? 0 : Math.PI, // both rows nose into the center aisle
          type: 'car',
          health: 1000,
          mesh: this.renderer.getNPCCarMesh([color[0], color[1], color[2]], parkedId),
          colorR: color[0], colorG: color[1], colorB: color[2],
        });
        n++;
      }
    }
  }
  // World persistence: save the player position + nearby local parked cars
  // (negative ids — server cars come back via the poll on their own) so a
  // page refresh drops the player back where they were, cars included.
  private saveWorldState() {
    if (this._destroyed || !this.isLoaded || !this.renderer) return;
    const nearby = this.parkedCars
      .filter(p => p.id < 0 && p.health > 0 && Math.hypot(p.x - this.carX, p.z - this.carZ) < 90)
      .slice(0, 24)
      .map(p => ({
        id: p.id, x: p.x, z: p.z, y: p.y, yaw: p.yaw,
        type: p.type, health: p.health,
        colorR: p.colorR, colorG: p.colorG, colorB: p.colorB,
      }));
    const state = {
      v: 1,
      savedAt: Date.now(),
      x: this.carX, z: this.carZ, y: this.carY, yaw: this.carYaw,
      wasInCar: this.isInCar,
      vehType: this.isInCar ? this.vehicleType : undefined,
      vehColor: this.isInCar ? this.playerVehicleColor : undefined,
      vehHealth: this.isInCar ? this.carHealth : undefined,
      parked: nearby,
    };
    try { localStorage.setItem(GT_WORLD_STATE_KEY, JSON.stringify(state)); } catch { }
  }
  // Persist the player's money, wanted level, owned weapons and ammo so a
  // refresh continues the session instead of resetting it. Called on the world
  // save tick and right after each poll adopts the server's authoritative state.
  private savePlayerState() {
    if (this._destroyed) return;
    try {
      localStorage.setItem(GT_PLAYER_STATE_KEY, JSON.stringify({
        v: 1,
        money: this.money,
        wantedLevel: this.wantedLevel,
        ownedWeapons: this.ownedWeapons,
        ammo: this.ammo,
        mission: this.captureMission()
      }));
    } catch { }
  }
  // Restore the persisted player state. Weapons/ammo are display-only until the
  // first poll returns the server's authoritative (DB-backed) loadout, which
  // overwrites these — weaponsSynced stays false so we never send a stale array.
  private restorePlayerState() {
    if (this._destroyed) return;
    let raw: string | null = null;
    try { raw = localStorage.getItem(GT_PLAYER_STATE_KEY); } catch { }
    if (!raw) return;
    let state: any = null;
    try { state = JSON.parse(raw); } catch { }
    if (!state) return;
    if (typeof state.money === 'number' && isFinite(state.money) && state.money >= 0) this.money = Math.floor(state.money);
    if (typeof state.wantedLevel === 'number' && isFinite(state.wantedLevel)) this.wantedLevel = Math.min(5, Math.max(0, Math.floor(state.wantedLevel)));
    if (Array.isArray(state.ownedWeapons) && state.ownedWeapons.length === 5) {
      this.ownedWeapons = state.ownedWeapons.map((v: any) => !!v);
    }
    if (Array.isArray(state.ammo) && state.ammo.length === 5) {
      this.ammo = state.ammo.map((v: any) => Math.max(0, Math.floor(Number(v) || 0)));
    }
  }
  // Serialize the currently active mission (taxi fare / dealership heist /
  // police job) so a refresh mid-mission can resume it. Meshes are regenerated
  // deterministically from the saved ids on restore — never serialized.
  private captureMission(): any {
    if (this.taxiMission) {
      const m = this.taxiMission;
      return { kind: 'taxi', state: m.state, passengerId: m.passengerId, passengerGender: m.passengerGender,
        passengerX: m.passengerX, passengerZ: m.passengerZ, destinationX: m.destinationX, destinationZ: m.destinationZ,
        fare: m.fare, phase: m.phase, timer: m.timer };
    }
    if (this.dealershipMission && this.dealershipTargetCar) {
      const m = this.dealershipMission;
      const c = this.dealershipTargetCar;
      return { kind: 'dealership', npcX: m.npcX, npcZ: m.npcZ, state: m.state, payout: m.payout,
        carX: c.x, carZ: c.z, carYaw: c.yaw, carHealth: c.health, colorR: c.colorR, colorG: c.colorG, colorB: c.colorB };
    }
    if (this.policeMode) {
      return { kind: 'police', policeRound: this.policeRound, policeModeKills: this.policeModeKills,
        policeModeSpawnsRemaining: this.policeModeSpawnsRemaining, policeModeSpawnTimer: this.policeModeSpawnTimer,
        policeModeRoundDelay: this.policeModeRoundDelay,
        thugCars: this.policeModeThugCars.map(t => ({ id: t.id, x: t.x, z: t.z, yaw: t.yaw, health: t.health, speed: t.speed, colorR: t.colorR, colorG: t.colorG, colorB: t.colorB, playerDamage: t.playerDamage ?? 0 })),
        thugPeds: this.policeModeThugPeds.map(t => ({ id: t.id, x: t.x, z: t.z, yaw: t.yaw, health: t.health, shootTimer: t.shootTimer })) };
    }
    return null;
  }
  // Rebuild a saved mission after a refresh — called once the renderer is ready,
  // right after restoreWorldState (the player is on foot next to their vehicle).
  private restoreMissionState() {
    if (this._destroyed) return;
    let raw: string | null = null;
    try { raw = localStorage.getItem(GT_PLAYER_STATE_KEY); } catch { }
    if (!raw) return;
    let state: any = null;
    try { state = JSON.parse(raw); } catch { }
    const mis = state?.mission;
    if (!mis) return;
    const num = (v: any, def: number) => (typeof v === 'number' && isFinite(v)) ? v : def;
    if (mis.kind === 'taxi') {
      const passengerId = Math.floor(num(mis.passengerId, 0));
      if (!passengerId) return;
      this.taxiMission = {
        state: mis.state === 'deliver' ? 'deliver' : 'pickup',
        passengerId,
        passengerGender: mis.passengerGender === 'female' ? 'female' : 'male',
        passengerMesh: null as any, // re-linked per frame (pickup) / regenerated below (deliver)
        passengerX: num(mis.passengerX, 0),
        passengerZ: num(mis.passengerZ, 0),
        destinationX: num(mis.destinationX, 0),
        destinationZ: num(mis.destinationZ, 0),
        fare: Math.max(0, num(mis.fare, 100)),
        phase: num(mis.phase, 0),
        timer: Math.max(0, num(mis.timer, 90)),
      };
      if (this.taxiMission.state === 'deliver') {
        // The passenger is already in the taxi — regenerate their mesh (the ped
        // was removed from the world at pickup) and re-attach them.
        this.taxiMission.passengerMesh = this.renderer.getPedestrianMesh(this.taxiMission.passengerGender, passengerId);
        this.stolenNpcIds.add(passengerId);
        this.taxiAttachedMeshes = [{
          mesh: this.taxiMission.passengerMesh,
          offsetX: 0.3, offsetY: -0.3, offsetZ: -1.0, yaw: 0, scale: 0.7,
        }];
      } else {
        this._taxiReacquireGrace = 8; // wait for the server ped to reappear
      }
      this._missionRestoreGrace = 5;
      return;
    }
    if (mis.kind === 'dealership') {
      const carX = num(mis.carX, this.carX), carZ = num(mis.carZ, this.carZ);
      // Only when the player was DRIVING the target at save time ('return') does
      // the world-state restore re-park a duplicate beside them — drop just that
      // one before adding the real target. In 'search' the car sits out in the
      // world, so leave any nearby parked cars alone.
      if (mis.state === 'return') {
        this.parkedCars = this.parkedCars.filter(p => Math.hypot(p.x - carX, p.z - carZ) >= 3);
      }
      const color: [number, number, number] = [num(mis.colorR, 0.5), num(mis.colorG, 0.5), num(mis.colorB, 0.5)];
      const newId = -Date.now(); // negative = local-only, survives the poll merge
      const mesh = this.renderer.getNPCCarMesh(color, newId);
      this.dealershipTargetCar = {
        id: newId, x: carX, z: carZ, yaw: num(mis.carYaw, 0), mesh,
        health: Math.max(1, num(mis.carHealth, 1000)),
        colorR: color[0], colorG: color[1], colorB: color[2], type: 'car',
      };
      this.parkedCars.push(this.dealershipTargetCar);
      this.dealershipMission = {
        npcX: num(mis.npcX, this.carX), npcZ: num(mis.npcZ, this.carZ),
        // Re-entering the parked target car flips it back to 'return'; restoring
        // the 'return' state on foot would instantly fail the heist.
        state: 'search',
        payout: Math.max(0, num(mis.payout, 5000)),
        targetCarId: newId,
        targetCarMesh: mesh,
      };
      return;
    }
    if (mis.kind === 'police') {
      this.policeMode = true;
      this.policeRound = Math.max(1, Math.floor(num(mis.policeRound, 1)));
      this.policeModeKills = Math.max(0, Math.floor(num(mis.policeModeKills, 0)));
      this.policeModeSpawnsRemaining = Math.max(0, Math.floor(num(mis.policeModeSpawnsRemaining, 0)));
      this.policeModeSpawnTimer = Math.max(0, num(mis.policeModeSpawnTimer, 0));
      this.policeModeRoundDelay = Math.max(0, num(mis.policeModeRoundDelay, 0));
      let minClientId = 20000;
      this.policeModeThugCars = (Array.isArray(mis.thugCars) ? mis.thugCars : []).map((t: any) => {
        const col: [number, number, number] = [num(t.colorR, 0.2), num(t.colorG, 0.2), num(t.colorB, 0.2)];
        const id = Math.floor(num(t.id, 0)) || (--this.pedIdCounter);
        const mesh = this.renderer.getNPCCarMesh(col, id);
        if (id > 0 && id < 20000) minClientId = Math.min(minClientId, id);
        return { id, x: num(t.x, this.carX), z: num(t.z, this.carZ), yaw: num(t.yaw, 0), mesh,
          health: Math.max(1, num(t.health, 500)), maxHealth: 500, speed: num(t.speed, 10),
          playerDamage: num(t.playerDamage, 0),
          colorR: col[0], colorG: col[1], colorB: col[2] };
      });
      this.policeModeThugPeds = (Array.isArray(mis.thugPeds) ? mis.thugPeds : []).map((t: any) => {
        const id = Math.floor(num(t.id, 0)) || (--this.pedIdCounter);
        const mesh = this.renderer.getPedestrianMesh('male', id);
        if (id > 0 && id < 20000) minClientId = Math.min(minClientId, id);
        return { id, x: num(t.x, this.carX), z: num(t.z, this.carZ), yaw: num(t.yaw, 0), mesh,
          health: Math.max(1, num(t.health, 100)), shootTimer: num(t.shootTimer, 0.5) };
      });
      // Keep new local spawns below every restored thug id to avoid collisions.
      if (minClientId < 20000) this.pedIdCounter = Math.min(this.pedIdCounter, minClientId);
      this._missionRestoreGrace = 5;
      return;
    }
  }
  // Restore a saved world snapshot right before the game loop starts. The
  // player respawns on foot at the saved spot; the vehicle they were driving
  // is parked beside them; nearby local parked cars come back in place.
  private restoreWorldState(): boolean {
    if (this._destroyed) return false;
    if (this.renderer.carMeshes.length === 0) {
      setTimeout(() => this.restoreWorldState(), 500);
      return false;
    }
    let raw: string | null = null;
    try { raw = localStorage.getItem(GT_WORLD_STATE_KEY); } catch { }
    if (!raw) return false;
    let state: any = null;
    try { state = JSON.parse(raw); } catch { }
    if (!state || typeof state.x !== 'number' || typeof state.z !== 'number' || isNaN(state.x) || isNaN(state.z)) return false;
    this.carX = state.x;
    this.carZ = state.z;
    // Spawn on foot at the local terrain surface: cap the saved altitude so a
    // refresh mid-flight can't park a plane in the sky or drop the player from
    // height. Rooftop stands (a few units up) are still preserved.
    const groundY = CAR_HEIGHT + getTerrainHeight(this.carX, this.carZ, this.carY, true);
    const savedY = typeof state.y === 'number' && !isNaN(state.y) ? state.y : CAR_HEIGHT;
    this.carY = Math.min(savedY, groundY + 6);
    this.carYaw = typeof state.yaw === 'number' && !isNaN(state.yaw) ? state.yaw : this.carYaw;
    this.camYaw = this.carYaw;
    // Interiors aren't persisted — restore the default walk camera so a refresh
    // inside a store doesn't leave the tight interior view stuck on.
    this.camDist = 4;
    this.camHeight = 2;
    if (state.wasInCar && state.vehType) {
      const color: [number, number, number] = Array.isArray(state.vehColor) && state.vehColor.length === 3
        ? [state.vehColor[0], state.vehColor[1], state.vehColor[2]] : [0.5, 0.5, 0.5];
      const vehId = -Date.now();
      this.parkedCars.push({
        id: vehId,
        x: this.carX, z: this.carZ, y: this.carY, yaw: this.carYaw,
        type: state.vehType,
        health: typeof state.vehHealth === 'number' ? state.vehHealth : 1000,
        mesh: this.makeParkedMesh(state.vehType, color, vehId),
        colorR: color[0], colorG: color[1], colorB: color[2],
      });
      const a = this.carYaw + Math.PI / 2;
      this.carX = state.x + Math.sin(a) * 2.4;
      this.carZ = state.z + Math.cos(a) * 2.4;
    }
    for (const pc of (state.parked || [])) {
      if (typeof pc.id !== 'number' || typeof pc.x !== 'number' || typeof pc.z !== 'number') continue;
      const col: [number, number, number] = [pc.colorR ?? 0.5, pc.colorG ?? 0.5, pc.colorB ?? 0.5];
      const carGroundY = CAR_HEIGHT + getTerrainHeight(pc.x, pc.z, pc.y, true);
      const carY = typeof pc.y === 'number' && !isNaN(pc.y) ? Math.min(pc.y, carGroundY + 6) : carGroundY;
      this.parkedCars.push({
        id: pc.id,
        x: pc.x, z: pc.z, y: carY, yaw: pc.yaw ?? 0,
        type: pc.type || 'car',
        health: typeof pc.health === 'number' ? pc.health : 1000,
        mesh: this.makeParkedMesh(pc.type || 'car', col, pc.id),
        colorR: col[0], colorG: col[1], colorB: col[2],
      });
    }
    return true;
  }
  // Type-aware parked-vehicle mesh, mirroring the poll's parked-car creation
  // so restored cars render with the right model for their type.
  private makeParkedMesh(type: string, color: [number, number, number], id: number): CityMesh | CityMesh[] {
    if (type === 'motorcycle') return this.renderer.getMotorcycleMesh(color, id);
    if (type === 'taxi') return this.renderer.getTaxiMesh();
    if (type === 'police') return this.renderer.getPoliceCarMesh();
    if (type === 'bus') return this.renderer.busMesh || this.renderer.getNPCCarMesh(color, id);
    if (type === 'helicopter') return this.renderer.getHelicopterMesh(id);
    if (type === 'plane') return this.renderer.getPlaneMesh(id);
    if (type === 'boat') return this.renderer.getBoatMesh(id);
    return this.renderer.getNPCCarMesh(color, id);
  }
  // True when a parked car already sits at/near a spot (used by the fixed lot
  // fillers so restored cars are never duplicated by a fresh spawn).
  private isSpotOccupied(x: number, z: number, radius = 2.2): boolean {
    for (const p of this.parkedCars) {
      if (p.health <= 0) continue;
      if (Math.hypot(p.x - x, p.z - z) < radius) return true;
    }
    return false;
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
    // Per-car driving style: a stable lateral bias (spreads cars across the
    // road so both lanes visibly carry traffic) plus a slow in-lane wander.
    const laneBias = (Math.random() - 0.5) * 4.5;
    const wanderPhase = Math.random() * Math.PI * 2;
    const wanderFreq = 0.4 + Math.random() * 0.6;
    const laneLen = Math.hypot(lane.offsetX, lane.offsetZ);
    const lat0 = laneBias + Math.sin(performance.now() / 1000 * wanderFreq + wanderPhase) * 0.8;
    const biasX = laneLen > 0 ? lane.offsetX / laneLen * lat0 : 0;
    const biasZ = laneLen > 0 ? lane.offsetZ / laneLen * lat0 : 0;
    const color = [0.3 + Math.random() * 0.5, 0.3 + Math.random() * 0.5, 0.3 + Math.random() * 0.5];
    const trafficId = --this.trafficNodeIdCounter;
    this.trafficCars.push({
      id: trafficId,
      x: startNode.x + lane.offsetX + biasX,
      z: startNode.z + lane.offsetZ + biasZ,
      yaw,
      type: 'traffic',
      mesh: this.renderer.getNPCCarMesh([color[0], color[1], color[2]], trafficId),
      health: 1000, colorR: color[0], colorG: color[1], colorB: color[2],
      path, pathIdx: 0,
      state: 'drive', stopTimer: 0, nextYaw: yaw,
      laneOffsetX: lane.offsetX, laneOffsetZ: lane.offsetZ,
      laneBias, wanderPhase, wanderFreq,
      hasDriver: true, speed: 0,
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
  /**
   * Re-route every traffic car after the road graph is rebuilt (the player
   * crossed into a new chunk) — old path indices point into the replaced
   * node array, so stale paths would send cars to wrong roads.
   */
  private repathAllTraffic() {
    if (this.trafficNodes.length < 2) { this.trafficCars.length = 0; return; }
    for (const car of this.trafficCars) {
      const fromIdx = this.closestNode(car.x, car.z);
      const toIdx = Math.floor(Math.random() * this.trafficNodes.length);
      const newPath = this.findPath(fromIdx, toIdx);
      if (newPath && newPath.length > 1) {
        car.path = newPath;
        car.pathIdx = 0;
      } else {
        // No route from here in the new graph — an empty path makes the main
        // loop re-path (and eventually remove) the car.
        car.path = [];
        car.pathIdx = 0;
      }
    }
  }

  private rebuildLanes() {
    this.trafficLanes = [];
    for (const edge of this.trafficEdges) {
      const a = this.trafficNodes[edge[0]], b = this.trafficNodes[edge[1]];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len === 0) continue;
      // Lane offset from road centerline — consistent 4.0 everywhere
      // so cars don't swerve when transitioning between biomes (especially bridges)
      const perpX = dz / len * 4.0, perpZ = -dx / len * 4.0;
      // Forward lane (from → to)
      this.trafficLanes.push({ fromIdx: edge[0], toIdx: edge[1], offsetX: perpX, offsetZ: perpZ });
      // Reverse lane (to → from) — opposite side ensures one-directional flow
      this.trafficLanes.push({ fromIdx: edge[1], toIdx: edge[0], offsetX: -perpX, offsetZ: -perpZ });
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
      if (this.hookerMoneyDrained > 0) {
        // Someone entered the 7m seclusion radius mid-session — hard-interrupt:
        // the hooker hops out and wanders off instead of pausing-and-resuming
        // once the area clears. Same radius as the start gate.
        this.dropPassenger(this.carX, this.carZ, this.carYaw);
        this.hookerMoneyDrained = 0;
      } else {
        // Not secluded yet — block the service from starting, keep the hooker
        // waiting in the car.
        this.carRockPhase = 0;
      }
      return;
    }
    this.carRocking = true;
    this.carRockPhase += dt * 3;
    if (this.health < 100) {
      this.health = Math.min(100, this.health + HOOKER_HEAL_PER_SEC * dt);
      // Once the healing service has completed, end the ride automatically so
      // the passenger does not remain stuck in the car indefinitely.
      if (this.health >= 100 - 0.001) {
        this.health = 100;
        this.carRocking = false;
        this.dropPassenger(this.carX, this.carZ, this.carYaw);
        this.hookerMoneyDrained = 0;
        this.showStoreToast('Health restored — passenger left the car');
        return;
      }
    }
    if (this.money <= 0) {
      this.passenger = null;
      this.hookerMoneyDrained = 0;
      return;
    }    if (this.hookerMoneyDrained < HOOKER_MAX_MONEY) {
      const elapsedCharge = Math.min(
        HOOKER_MONEY_PER_SEC * dt,
        HOOKER_MAX_MONEY - this.hookerMoneyDrained,
        this.money
      );
      this.hookerPaymentRemainder += elapsedCharge;
      const wholeDollars = Math.min(this.money, Math.floor(this.hookerPaymentRemainder));
      if (wholeDollars > 0) {
        this.money -= wholeDollars;
        this.hookerMoneyDrained += wholeDollars;
        this.hookerPaymentRemainder -= wholeDollars;
      }
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
    const now = performance.now();
    for (const npc of this.serverNPCs) this.lerpNPC(npc, now);
    for (const ped of this.serverPedestrians) this.lerpNPC(ped, now);
  }
  private lerpNPC(npc: any, now: number) {
    if (npc.lastUpdate === undefined || npc.targetX === undefined) return;
    const t = Math.min(1, (now - npc.lastUpdate) / 1000);
    npc.x = npc.prevX + (npc.targetX - npc.prevX) * t;
    npc.z = npc.prevZ + (npc.targetZ - npc.prevZ) * t;
    if (npc.targetY !== undefined) npc.y = npc.prevY + (npc.targetY - npc.prevY) * t;
    let yawDiff = npc.targetYaw - npc.prevYaw;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    npc.yaw = npc.prevYaw + yawDiff * t;
  }
  // ── Taxi passenger ride (destination waypoints) ──────────────────────────
  private nearestDealership(): { x: number; z: number; yaw: number } {
    if (this.dealershipNPCs.length > 0) {
      const dl = this.dealershipNPCs[0];
      return { x: dl.x, z: dl.z, yaw: -Math.PI / 2 };
    }
    return { x: 960 + 18, z: -480 + 25, yaw: -Math.PI / 2 };
  }
  private openTaxiDestinations() {
    if (this.taxiRideActive || this.isInCar || this.isPassenger) return;
    const dealership = this.nearestDealership();
    this.taxiDestinations = [
      { name: 'Hospital', icon: '🏥', x: HOSPITAL_SPAWN_X, z: HOSPITAL_SPAWN_Z, yaw: HOSPITAL_SPAWN_YAW },
      { name: 'Dealership', icon: '🚗', x: dealership.x, z: dealership.z, yaw: dealership.yaw },
      { name: 'Garage', icon: '🔧', x: GARAGE_ENTRANCE_X, z: GARAGE_ENTRANCE_Z + 3, yaw: 0 },
    ];
    this.showTaxiDestinations = true;
  }
  selectTaxiDestination(dest: { name: string; icon: string; x: number; z: number; yaw: number }) {
    this.showTaxiDestinations = false;
    if (this.isInCar || this.isPassenger) return;
    // Taxi pulls up a few units short of the destination, then you step out.
    const stopDist = 5;
    const stopX = dest.x - Math.sin(dest.yaw) * stopDist;
    const stopZ = dest.z - Math.cos(dest.yaw) * stopDist;
    const terrainY = getTerrainHeight(stopX, stopZ);
    const roofY = this.getBuildingRoofY(stopX, stopZ);
    this.carX = stopX; this.carZ = stopZ;
    this.carY = CAR_HEIGHT + (roofY > terrainY ? roofY : terrainY);
    this.carYaw = dest.yaw;
    this.carVx = 0; this.carVz = 0; this.carSpeed = 0;
    this.camYaw = dest.yaw;
    this.camPitch = 0.2;
    this.camDist = 4; this.camHeight = 2;
    this.isInCar = false;
    this.isPassenger = false;
    this.taxiRideActive = true;
    this.taxiRidePhase = 'arriving';
    this.taxiRideTimer = 0;
    this.taxiRideHidePlayer = true; // riding inside until the taxi stops
    this.taxiRideStartX = stopX + Math.sin(dest.yaw) * 60;
    this.taxiRideStartZ = stopZ + Math.cos(dest.yaw) * 60;
    this.taxiRideStopX = stopX; this.taxiRideStopZ = stopZ;
    this.taxiRideTaxi = {
      id: -900000 - Math.floor(Math.random() * 100000),
      x: this.taxiRideStartX, z: this.taxiRideStartZ, yaw: dest.yaw,
      mesh: this.renderer.getTaxiMesh(),
      type: 'taxi', health: 1000, colorR: 1, colorG: 0.85, colorB: 0.1,
    };
  }
  private updateTaxiRide(dt: number) {
    if (!this.taxiRideActive || !this.taxiRideTaxi) return;
    this.taxiRideTimer += dt;
    const taxi = this.taxiRideTaxi;
    if (this.taxiRidePhase === 'arriving') {
      const dur = 3.0;
      const t = Math.min(1, this.taxiRideTimer / dur);
      const ease = 1 - Math.pow(1 - t, 3); // ease-out glide to the curb
      taxi.x = this.taxiRideStartX + (this.taxiRideStopX - this.taxiRideStartX) * ease;
      taxi.z = this.taxiRideStartZ + (this.taxiRideStopZ - this.taxiRideStartZ) * ease;
      if (t >= 1) {
        this.taxiRidePhase = 'stopped';
        this.taxiRideTimer = 0;
        // You step out beside the taxi.
        this.taxiRideHidePlayer = false;
        const angle = taxi.yaw - Math.PI / 2;
        this.carX = taxi.x + Math.sin(angle) * 2.2;
        this.carZ = taxi.z + Math.cos(angle) * 2.2;
        const eT = getTerrainHeight(this.carX, this.carZ);
        const eR = this.getBuildingRoofY(this.carX, this.carZ);
        this.carY = CAR_HEIGHT + (eR > eT ? eR : eT);
        this.carYaw = taxi.yaw;
      }
    } else if (this.taxiRidePhase === 'stopped') {
      if (this.taxiRideTimer >= 1.2) {
        this.taxiRidePhase = 'departing';
        this.taxiRideTimer = 0;
      }
    } else if (this.taxiRidePhase === 'departing') {
      const dur = 2.5;
      const t = Math.min(1, this.taxiRideTimer / dur);
      const ease = t * t; // accelerate away
      taxi.x = this.taxiRideStopX + Math.sin(taxi.yaw) * 90 * ease;
      taxi.z = this.taxiRideStopZ + Math.cos(taxi.yaw) * 90 * ease;
      if (t >= 1) {
        // Hand the taxi off to the server so it becomes a real NPC taxi that
        // keeps driving away (visible to everyone) instead of just vanishing.
        this.gtService.spawnTaxi(1, taxi.x, taxi.z, taxi.yaw);
        this.endTaxiRide();
      }
    }
  }
  private endTaxiRide() {
    this.taxiRideActive = false;
    this.taxiRideTaxi = null;
    this.taxiRideHidePlayer = false;
    this.taxiRidePhase = 'arriving';
    this.taxiRideTimer = 0;
    this.camDist = 4; this.camHeight = 2;
  }
  // Abandoning a taxi fare: the passenger hops out and walks off (mirroring
  // the delivery path), the fare is failed, and the mission toast shows.
  private abortTaxiFare() {
    const m = this.taxiMission;
    if (m && m.passengerMesh) {
      const walkAngle = Math.random() * Math.PI * 2;
      const walkDist = 20;
      const pedId = --this.pedIdCounter;
      this.stolenNpcIds.add(pedId);
      this.localPedestrians.push({
        id: pedId,
        x: this.carX, z: this.carZ,
        yaw: walkAngle,
        gender: m.passengerGender || 'female',
        mesh: m.passengerMesh,
        health: 100,
        targetX: this.carX + Math.sin(walkAngle) * walkDist,
        targetZ: this.carZ + Math.cos(walkAngle) * walkDist,
        waitTimer: 0,
      });
      this.stolenNpcIds.delete(m.passengerId);
    }
    this.taxiMission = null;
    this.taxiMarkers = [];
    this.taxiAttachedMeshes = [];
    this.taxiSearchTimer = 0;
    this.showMissionFailedToast('❌ MISSION FAILED');
  }
  private updateTaxiMission(dt: number) {
    this.taxiMode = this.isInCar && this.vehicleType === 'taxi';
    if (!this.taxiMode) {
      // Right after a refresh the player is on foot next to the taxi — give
      // them a few seconds to hop back in before the fare aborts.
      if (!this.isInCar && this._missionRestoreGrace > 0) {
        this._missionRestoreGrace -= dt;
        return;
      }
      // No longer in a taxi — fare aborted (deliberate exit, or the taxi was
      // destroyed). exitCar already handles the manual-exit path; this
      // catches every other way of leaving the taxi.
      if (this.taxiMission) this.abortTaxiFare();
      return;
    }
    this._missionRestoreGrace = 0;
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
          // After a refresh the passenger (a server ped) reappears with the
          // first poll — wait briefly before giving up on a restored fare.
          if (this._taxiReacquireGrace > 0) { this._taxiReacquireGrace -= dt; return; }
          this.taxiMission = null;
          this.taxiMarkers = [];
          this.taxiAttachedMeshes = [];
          return;
        }
        this._taxiReacquireGrace = 0;
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
  togglePoliceMode() {
    if (this.policeMode) {
      this.policeMode = false;
      this.policeModeThugCars = [];
      this.policeModeThugPeds = [];
      this.policeModeSpawnsRemaining = 0;
      this.policeRound = 0;
    } else {
      this.policeMode = true;
      this.policeRound = 1;
      this.policeModeKills = 0;
      this.startPoliceRound();
    }
  }
  private startPoliceRound() {
    const baseThugs = this.policeRound + 2;
    this.policeModeSpawnsRemaining = baseThugs;
    this.policeModeKills = 0;
    this.policeModeSpawnTimer = 0;
  }
  private spawnThug() {
    const isCar = Math.random() < 0.5;
    if (isCar) this.spawnThugCar();
    else this.spawnThugPed();
  }
  private spawnThugCar() {
    const angle = Math.random() * Math.PI * 2;
    const dist = 40 + Math.random() * 60;
    const x = this.carX + Math.sin(angle) * dist;
    const z = this.carZ + Math.cos(angle) * dist;
    const thugId = --this.pedIdCounter;
    const color: [number, number, number] = [0.1 + Math.random() * 0.3, 0.1 + Math.random() * 0.3, 0.1 + Math.random() * 0.3];
    this.policeModeThugCars.push({
      id: thugId,
      x, z,
      yaw: Math.atan2(this.carX - x, this.carZ - z),
      mesh: this.renderer.getNPCCarMesh(color, thugId),
      health: 500,
      maxHealth: 500,
      speed: 10 + Math.random() * 10,
      colorR: color[0], colorG: color[1], colorB: color[2],
    });
  }
  private spawnThugPed() {
    const angle = Math.random() * Math.PI * 2;
    const dist = 30 + Math.random() * 50;
    const x = this.carX + Math.sin(angle) * dist;
    const z = this.carZ + Math.cos(angle) * dist;
    const thugId = --this.pedIdCounter;
    this.policeModeThugPeds.push({
      id: thugId,
      x, z,
      yaw: Math.atan2(this.carX - x, this.carZ - z),
      mesh: this.renderer.getPedestrianMesh('male', thugId),
      health: 100,
      shootTimer: 0.5 + Math.random() * 0.5,
    });
  }
  private updatePoliceMode(dt: number) {
    if (!this.policeMode) return;
    if (!this.isInCar || this.vehicleType !== 'police') {
      // Refresh-resume grace: on foot next to the parked cruiser, wait a few
      // seconds for the player to climb back in before ending the job.
      if (!this.isInCar && this._missionRestoreGrace > 0) {
        this._missionRestoreGrace -= dt;
        return;
      }
      this.togglePoliceMode();
      return;
    }
    this._missionRestoreGrace = 0;
    if (this.policeModeSpawnsRemaining > 0) {
      this.policeModeSpawnTimer += dt;
      if (this.policeModeSpawnTimer >= 1.0) {
        this.policeModeSpawnTimer = 0;
        this.spawnThug();
        this.policeModeSpawnsRemaining--;
      }
    }
    for (const thug of this.policeModeThugPeds) {
      const dx = this.carX - thug.x;
      const dz = this.carZ - thug.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 2) {
        const targetYaw = Math.atan2(dx, dz);
        let yawDiff = targetYaw - thug.yaw;
        while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
        while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
        thug.yaw += yawDiff * Math.min(1, 6 * dt);
        const speed = 3.5;
        thug.x += Math.sin(thug.yaw) * speed * dt;
        thug.z += Math.cos(thug.yaw) * speed * dt;
      }
      thug.shootTimer -= dt;
      if (thug.shootTimer <= 0 && dist < 40) {
        thug.shootTimer = 0.12;
        const targetY = this.carY + 1.0;
        const tdx = this.carX - thug.x;
        const tdz = this.carZ - thug.z;
        const tdy = targetY - 1.0;
        const td3 = Math.sqrt(tdx * tdx + tdy * tdy + tdz * tdz);
        if (td3 > 0.01) {
          this.tracers.push({ originX: thug.x, originY: 1.0, originZ: thug.z, dirX: tdx / td3, dirY: tdy / td3, dirZ: tdz / td3, age: 0, lifetime: 0.2 });
          this.muzzleFlashes.push({ x: thug.x, y: 1.0, z: thug.z, dirX: tdx / td3, dirY: tdy / td3, dirZ: tdz / td3, weapon: 2, age: 0, lifetime: 0.08 });
          this.spawnBulletSmoke(thug.x, 1.0, thug.z, tdx / td3, tdy / td3, tdz / td3, 2);
          this.spawnBulletTrail(thug.x, 1.0, thug.z, tdx / td3, tdy / td3, tdz / td3, 2);
          this.damageAlpha = 0.4;
          this.gtService.hit(0, this.getUserId(), 1, 8, thug.x, thug.z).then((res: any) => {
            if (res && res.targetHealth !== undefined) this.health = res.targetHealth;
          });
          this.playWeaponSound(2, this.getShotVolumeScale(thug.x, thug.z));
          // Thugs spray fast, so keep the zing a sparse accent.
          const zingScale = this.getShotVolumeScale(thug.x, thug.z);
          if (Math.random() < 0.25 * zingScale) this.playRicochetZing(zingScale);
        }
      }
    }
    for (const car of this.policeModeThugCars) {
      const dx = this.carX - car.x;
      const dz = this.carZ - car.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 3) {
        const targetYaw = Math.atan2(dx, dz);
        let yawDiff = targetYaw - car.yaw;
        while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
        while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
        car.yaw += yawDiff * Math.min(1, 4 * dt);
        const targetSpeed = Math.min(28, dist * 0.4);
        car.speed += (targetSpeed - car.speed) * Math.min(1, 3 * dt);
        car.x += Math.sin(car.yaw) * car.speed * dt;
        car.z += Math.cos(car.yaw) * car.speed * dt;
      } else {
        car.speed *= 0.95;
      }
      const px = this.carX - car.x, pz = this.carZ - car.z;
      if (Math.hypot(px, pz) < 2.5 && car.health > 0) {
        this.carHealth -= 8 * dt;
        this.spawnExplosion(car.x, 0.5, car.z);
      }
      // Shared smoke rule for thug cars: start smoking at 35% health and
      // emit for at most 10s per phase, mirroring NPC/parked cars.
      const smokeNow = performance.now() / 1000;
      if (car.health > car.maxHealth * 0.35 || car.health <= 0) {
        car.isSmoking = false;
        car.smokeStarted = undefined;
        car.smokeTimer = 0;
      } else {
        if (!car.isSmoking) {
          car.isSmoking = true;
          car.smokeStarted = smokeNow;
        }
        if (smokeNow - car.smokeStarted! >= 10) {
          car.isSmoking = false;
        } else if ((car.smokeTimer ?? 0) < smokeNow - 0.15) {
          car.smokeTimer = smokeNow;
          const sinY = Math.sin(car.yaw), cosY = Math.cos(car.yaw);
          const sx = car.x + cosY * 0.8;
          const sz = car.z + sinY * 0.8;
          this.carSmoke.push({
            x: sx + (Math.random() - 0.5) * 0.6,
            y: 0.6 + Math.random() * 0.4,
            z: sz + (Math.random() - 0.5) * 0.6,
            vx: (Math.random() - 0.5) * 0.5,
            vy: 0.3 + Math.random() * 0.4,
            vz: (Math.random() - 0.5) * 0.5,
            size: 0.4 + Math.random() * 0.5,
            age: 0,
            lifetime: 2.0 + Math.random() * 1.5,
          });
        }
      }
      // Shared fire rule for thug cars: critically damaged (≤ max(2, 1% of
      // maxHealth), mirroring the server's NPC threshold) cars catch fire and
      // burn for 10 seconds before exploding — exactly like regular NPC and
      // parked cars. The death sweep below turns health 0 into the explosion.
      const fireThreshold = Math.max(2, car.maxHealth / 100);
      if (car.health > fireThreshold || car.health <= 0) {
        car.isBurning = false;
        car.fireStarted = undefined;
      } else {
        if (!car.isBurning) {
          car.isBurning = true;
          car.fireStarted = performance.now() / 1000;
        } else if (car.fireStarted && (performance.now() / 1000) - car.fireStarted >= 10) {
          car.health = 0;
        }
      }
    }
    for (let i = this.policeModeThugPeds.length - 1; i >= 0; i--) {
      const thug = this.policeModeThugPeds[i];
      if (thug.health <= 0) {
        const payout = 5000 + Math.floor(Math.random() * 5001);
        this.dropMoneyAt(thug.x, thug.z, payout);
        this.money += payout;
        this.deadBodies.push({ id: thug.id, x: thug.x, z: thug.z, yaw: thug.yaw, type: 'ped_male', gender: 'male', mesh: thug.mesh, deathTime: performance.now() / 1000, lifetime: 30 });
        this.bloodPools.push({ x: thug.x, z: thug.z - 1.0, age: 0, lifetime: 30, maxRadius: 3, variant: Math.floor(Math.random() * 4) });
        this.policeModeKills++;
        this.policeModeThugPeds.splice(i, 1);
      }
    }
    for (let i = this.policeModeThugCars.length - 1; i >= 0; i--) {
      const car = this.policeModeThugCars[i];
      if (car.health <= 0) {
        this.spawnExplosion(car.x, 0.5, car.z);
        const basePayout = 5000 + Math.floor(Math.random() * 5001);
        const dmgFraction = Math.min(1, (car.playerDamage ?? 0) / car.maxHealth);
        // Payout scales with the damage the player actually dealt. Full payout
        // requires landing the killing blow; a car that burns out on its own
        // (half-killed and ignored) only pays a small salvage fraction, so
        // convoys can't be farmed by walking away mid-fight.
        const payout = car.killedByPlayer
          ? Math.round(basePayout * Math.max(0.25, dmgFraction))
          : Math.round(basePayout * 0.1 * dmgFraction);
        this.dropMoneyAt(car.x, car.z, payout);
        this.money += payout;
        this.deadBodies.push({ id: car.id, x: car.x, z: car.z, yaw: car.yaw, type: 'car', mesh: car.mesh, deathTime: performance.now() / 1000, lifetime: 30 });
        this.policeModeKills++;
        this.policeModeThugCars.splice(i, 1);
      }
    }
    if (this.policeModeSpawnsRemaining <= 0 && this.policeModeThugCars.length === 0 && this.policeModeThugPeds.length === 0) {
      this.policeModeRoundDelay += dt;
      if (this.policeModeRoundDelay >= 3) {
        this.policeModeRoundDelay = 0;
        this.policeRound++;
        this.startPoliceRound();
      }
    }
  }
  private stopDealershipMission() {
    this.dealershipMission = null;
    if (this.dealershipTargetCar) {
      this.parkedCars = this.parkedCars.filter(p => p.id !== this.dealershipTargetCar!.id);
      this.dealershipTargetCar = null;
    }
  }
  // Aborts every active mission at once (used on death — you can't finish a
  // job while dead). Clears the taxi driver mission, the car-theft dealership
  // mission, and the police mission with all its spawned thugs.
  private cancelAllMissions() {
    this.taxiMission = null;
    this.taxiMarkers = [];
    this.taxiAttachedMeshes = [];
    this.taxiSearchTimer = 0;
    this.stopDealershipMission();
    this.dealershipMarkers = [];
    this.policeMode = false;
    this.policeModeThugCars = [];
    this.policeModeThugPeds = [];
    this.policeModeSpawnsRemaining = 0;
    this.policeModeRoundDelay = 0;
    this.policeModeSpawnTimer = 0;
    this.policeRound = 0;
    this.policeModeKills = 0;
    this._missionRestoreGrace = 0;
    this._taxiReacquireGrace = 0;
  }
  startDealershipMission() {
    const npc = this.dealershipNPCs.find(n => {
      const dx = n.x - this.carX, dz = n.z - this.carZ;
      return Math.hypot(dx, dz) < 8;
    });
    if (!npc || this.isInCar) return;
    const targetId = --this.pedIdCounter;
    const color: [number, number, number] = [0.2 + Math.random() * 0.6, 0.2 + Math.random() * 0.6, 0.2 + Math.random() * 0.6];
    const targetMesh = this.renderer.getNPCCarMesh(color, targetId);
    const angle = Math.random() * Math.PI * 2;
    const dist = 80 + Math.random() * 120;
    let tx = this.carX + Math.sin(angle) * dist;
    let tz = this.carZ + Math.cos(angle) * dist;
    const snapX = Math.round((tx - 40) / 80) * 80 + 40;
    const snapZ = Math.round((tz - 40) / 80) * 80 + 40;
    tx = snapX + (tx >= snapX ? 18 : -18);
    tz = snapZ + (tz >= snapZ ? 18 : -18);
    this.dealershipTargetCar = {
      id: targetId, x: tx, z: tz, yaw: Math.random() * Math.PI * 2,
      mesh: targetMesh, health: 1000, type: 'car',
      colorR: color[0], colorG: color[1], colorB: color[2],
    };
    this.parkedCars.push(this.dealershipTargetCar);
    const payout = 5000 + Math.floor(Math.random() * 5001);
    this.dealershipMission = {
      npcX: npc.x, npcZ: npc.z,
      state: 'search',
      payout,
      targetCarId: targetId,
      targetCarMesh: targetMesh,
    };
  }
  // Cops ejected from a stolen, driven police car. They hunt the thief: chase
  // on foot, shoot while the player is armed, or charge and beat the player
  // down ("arrest") while unarmed. They give up and despawn if the player outruns
  // them or drops out of sight of the road, and clear entirely on respawn.
  private updateEvictedCops(dt: number) {
    for (let i = this.evictedCops.length - 1; i >= 0; i--) {
      const cop = this.evictedCops[i];
      if (cop.health <= 0) {
        this.deadBodies.push({ id: cop.id, x: cop.x, z: cop.z, yaw: cop.yaw, type: 'ped_male', gender: 'male', mesh: cop.mesh, deathTime: performance.now() / 1000, lifetime: 30 });
        this.bloodPools.push({ x: cop.x, z: cop.z - 1.0, age: 0, lifetime: 30, maxRadius: 3, variant: Math.floor(Math.random() * 4) });
        this.evictedCops.splice(i, 1);
        continue;
      }
      const dx = this.carX - cop.x;
      const dz = this.carZ - cop.z;
      const dist = Math.hypot(dx, dz);
      // Give up if the thief escapes (too far, or too much time since the theft
      // without line of sight on the street grid).
      if (dist > 260 || !this.isInCar && dist > 60) {
        this.evictedCops.splice(i, 1);
        continue;
      }
      const armed = this.currentWeapon > 0 && this.ammo[this.currentWeapon] > 0;
      const targetYaw = Math.atan2(dx, dz);
      let yawDiff = targetYaw - cop.yaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      cop.yaw += yawDiff * Math.min(1, 6 * dt);
      // Armed thief: cops stop at rifle range and fire. Unarmed thief: they rush
      // in and swing to subdue (arrest), only returning fire if shot first.
      const desiredRange = armed ? 16 + Math.random() * 6 : 1.2;
      const speed = armed ? 5.5 : 3.2;
      if (dist > desiredRange) {
        cop.x += Math.sin(cop.yaw) * speed * dt;
        cop.z += Math.cos(cop.yaw) * speed * dt;
      }
      cop.speed = dist > desiredRange ? speed : 0;
      cop.targetX = this.carX; cop.targetZ = this.carZ;
      if (armed && dist < 30) {
        cop.attackTimer -= dt;
        if (cop.attackTimer <= 0) {
          cop.attackTimer = 0.14;
          const tdy = (this.carY + 1.0) - 1.0;
          const td3 = Math.sqrt(dx * dx + tdy * tdy + dz * dz);
          if (td3 > 0.01) {
            const ux = dx / td3, uy = tdy / td3, uz = dz / td3;
            this.tracers.push({ originX: cop.x, originY: 1.0, originZ: cop.z, dirX: ux, dirY: uy, dirZ: uz, age: 0, lifetime: 0.2 });
            this.muzzleFlashes.push({ x: cop.x, y: 1.0, z: cop.z, dirX: ux, dirY: uy, dirZ: uz, weapon: 2, age: 0, lifetime: 0.08 });
            this.spawnBulletSmoke(cop.x, 1.0, cop.z, ux, uy, uz, 2);
            this.spawnBulletTrail(cop.x, 1.0, cop.z, ux, uy, uz, 2);
            this.damageAlpha = 0.4;
            this.gtService.hit(0, this.getUserId(), 1, 8, cop.x, cop.z).then((res: any) => {
              if (res && res.targetHealth !== undefined) this.health = res.targetHealth;
            });
            this.playWeaponSound(2, this.getShotVolumeScale(cop.x, cop.z));
          }
        }
      } else if (!armed && dist < 1.7) {
        cop.attackTimer -= dt;
        if (cop.attackTimer <= 0) {
          cop.attackTimer = 0.5;
          // Subduing strike — the "arrest" while unarmed. Small melee chip plus
          // visible feedback; the first grader does not instantly down the thief,
          // so there's a fair window to fight back or flee.
          this.health = Math.max(0, this.health - 8);
          this.damageAlpha = 0.3;
          this.spawnBlood(this.carX, this.carY + 1.0, this.carZ, Math.sin(cop.yaw), 0.3, Math.cos(cop.yaw), true);
          this.playPunchThud();
        }
      } else {
        cop.attackTimer = Math.min(cop.attackTimer, 0.3);
      }
    }
  }
  private updateDealershipMission(dt: number) {
    this.nearDealerNPC = false;
    this.dealershipMarkers = [];
    for (const npc of this.dealershipNPCs) {
      const dx = npc.x - this.carX, dz = npc.z - this.carZ;
      const dist = Math.hypot(dx, dz);
      if (dist < 8 && !this.isInCar) {
        this.nearDealerNPC = true;
      }
      this.dealershipMarkers.push({ type: 'hail', x: npc.x, z: npc.z, phase: npc.id });
    }
    if (!this.dealershipMission) return;
    const m = this.dealershipMission;
    if (m.state === 'search' && this.dealershipTargetCar && this.dealershipTargetCar.health <= 0) {
      this.dealershipMission = null;
      this.dealershipTargetCar = null;
      this.parkedCars = this.parkedCars.filter(p => p.id !== m.targetCarId);
      return;
    }
    if (m.state === 'search') {
      if (this.dealershipTargetCar) {
        this.dealershipMarkers.push({ type: 'destination', x: this.dealershipTargetCar.x, z: this.dealershipTargetCar.z });
      }
      if (this.currentCarId === m.targetCarId && this.isInCar) {
        m.state = 'return';
      }
    }
    if (m.state === 'return') {
      this.dealershipMarkers.push({ type: 'beam', x: m.npcX, z: m.npcZ });
      // Hopping out of the stolen car mid-return (or switching vehicles)
      // abandons the heist — fail it instead of leaving it hanging forever.
      if (!this.isInCar || this.currentCarId !== m.targetCarId) {
        this.dealershipMission = null;
        this.dealershipTargetCar = null;
        this.parkedCars = this.parkedCars.filter(p => p.id !== m.targetCarId);
        this.dealershipMarkers = [];
        this.showMissionFailedToast('❌ MISSION FAILED');
        return;
      }
      const dx = m.npcX - this.carX, dz = m.npcZ - this.carZ;
      if (this.isInCar && this.currentCarId === m.targetCarId && Math.hypot(dx, dz) < 6) {
        this.money += m.payout;
        this.moneyStacks.push({ x: m.npcX, z: m.npcZ, amount: m.payout, yaw: 0, age: 0, lifetime: 5 });
        this.dealershipMission = null;
        this.dealershipTargetCar = null;
        this.parkedCars = this.parkedCars.filter(p => p.id !== m.targetCarId);
        this.currentCarId = 0;
        this.exitCar();
      }
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
    const now = performance.now();
    // Other players — red dots
    ctx.fillStyle = '#ff0000';
    for (const p of this.otherPlayers) {
      ctx.beginPath(); ctx.arc(cx + (p.posX - this.carX) * scale, cy + (p.posZ - this.carZ) * scale, 3, 0, Math.PI * 2); ctx.fill();
    }
    // Police detection circles (draw under police icons)
    if (this.wantedLevel > 0) {
      const cops = [
        ...this.serverNPCs.filter(n => n.type === 'police' || n.type === 'cop'),
        ...this.serverPedestrians.filter(p => p.type === 'cop'),
        ...this.parkedCars.filter(pc => pc.type === 'police')
      ];
      ctx.strokeStyle = 'rgba(255, 100, 100, 0.2)';
      ctx.fillStyle = 'rgba(255, 50, 50, 0.06)';
      ctx.lineWidth = 1;
      for (const cop of cops) {
        const mx = cx + (cop.x - this.carX) * scale;
        const my = cy + (cop.z - this.carZ) * scale;
        const r = 25 * scale; // 25-unit detection range scaled to map
        if (mx > -r && mx < 300 + r && my > -r && my < 300 + r) {
          ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
      }
    }
    // Police cars (type 'police') — blue shield
    ctx.fillStyle = '#4488ff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    for (const npc of this.serverNPCs) {
      if (npc.type !== 'police') continue;
      const mx = cx + (npc.x - this.carX) * scale;
      const my = cy + (npc.z - this.carZ) * scale;
      ctx.beginPath();
      ctx.moveTo(mx, my - 4); ctx.lineTo(mx + 3, my - 1);
      ctx.lineTo(mx + 2, my + 3); ctx.lineTo(mx, my + 1);
      ctx.lineTo(mx - 2, my + 3); ctx.lineTo(mx - 3, my - 1);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // Parked police cars
    for (const pc of this.parkedCars) {
      if (pc.type !== 'police') continue;
      const mx = cx + (pc.x - this.carX) * scale;
      const my = cy + (pc.z - this.carZ) * scale;
      ctx.beginPath();
      ctx.moveTo(mx, my - 4); ctx.lineTo(mx + 3, my - 1);
      ctx.lineTo(mx + 2, my + 3); ctx.lineTo(mx, my + 1);
      ctx.lineTo(mx - 2, my + 3); ctx.lineTo(mx - 3, my - 1);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // Pedestrian cops (type 'cop') — blue dots
    ctx.fillStyle = '#6699ff';
    for (const npc of this.serverNPCs) {
      if (npc.type !== 'cop') continue;
      ctx.beginPath(); ctx.arc(cx + (npc.x - this.carX) * scale, cy + (npc.z - this.carZ) * scale, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    for (const ped of this.serverPedestrians) {
      if (ped.type !== 'cop') continue;
      ctx.beginPath(); ctx.arc(cx + (ped.x - this.carX) * scale, cy + (ped.z - this.carZ) * scale, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    // Regular NPCs — yellow dots
    ctx.fillStyle = '#ffff00';
    for (const npc of this.serverNPCs) {
      if (npc.type === 'police' || npc.type === 'cop') continue;
      ctx.beginPath(); ctx.arc(cx + (npc.x - this.carX) * scale, cy + (npc.z - this.carZ) * scale, 2, 0, Math.PI * 2); ctx.fill();
    }
    for (const pc of this.parkedCars) {
      if (pc.type === 'police') continue;
      ctx.beginPath(); ctx.arc(cx + (pc.x - this.carX) * scale, cy + (pc.z - this.carZ) * scale, 2, 0, Math.PI * 2); ctx.fill();
    }
    // Random weapon drops — gold pulsing markers. The server only tags
    // land-valid random drops, while home-base/death drops keep their existing
    // behavior and are intentionally not duplicated on this layer.
    for (const dw of this.droppedWeapons) {
      if (!dw?.isRandom) continue;
      const mx = cx + (dw.posX - this.carX) * scale;
      const my = cy + (dw.posZ - this.carZ) * scale;
      if (mx < -12 || mx > 312 || my < -12 || my > 312) continue;
      const pulse = 1 + Math.sin(now / 220 + (dw.id || 0)) * 0.18;
      const radius = 5.5 * pulse;
      ctx.fillStyle = 'rgba(255, 210, 40, 0.22)';
      ctx.beginPath(); ctx.arc(mx, my, radius + 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd228';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(mx, my, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#4a3510';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('W', mx, my);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }
    // Draw player as a green arrow showing movement direction
    const pYaw = this.carYaw;
    const fx = Math.sin(pYaw);
    const fy = Math.cos(pYaw);
    const rx = -fy;
    const ry = fx;
    const arrowSize = 7;
    ctx.fillStyle = '#00ff00';
    ctx.beginPath();
    ctx.moveTo(cx + fx * arrowSize, cy + fy * arrowSize); // Tip of the arrow
    ctx.lineTo(cx - fx * arrowSize * 0.5 - rx * arrowSize * 0.5, cy - fy * arrowSize * 0.5 - ry * arrowSize * 0.5); // Back-left
    ctx.lineTo(cx - fx * arrowSize * 0.5 + rx * arrowSize * 0.5, cy - fy * arrowSize * 0.5 + ry * arrowSize * 0.5); // Back-right
    ctx.closePath();
    ctx.fill();
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
    // Gas stations / repair shops — green wrench markers (exploded stations
    // are skipped by the renderer, so the map only shows working shops).
    // Re-scan when the player has traveled ~40 units since the last scan.
    if (Math.hypot(this.carX - this._mapGasCenterX, this.carZ - this._mapGasCenterZ) > 40 || this._mapGasStations.length === 0) {
      this._mapGasCenterX = this.carX;
      this._mapGasCenterZ = this.carZ;
      this._mapGasStations = this.renderer.getNearbyGasStations(this.carX, this.carZ, 310);
    }
    for (const gs of this._mapGasStations) {
      const gx = cx + (gs.x - this.carX) * scale;
      const gy = cy + (gs.z - this.carZ) * scale;
      if (gx < -10 || gx > 310 || gy < -10 || gy > 310) continue;
      const pulse = 5 + Math.sin(now / 300) * 1.2;
      ctx.fillStyle = 'rgba(80, 220, 120, 0.22)';
      ctx.beginPath(); ctx.arc(gx, gy, 7 + pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#50dc78';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(gx, gy, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // Wrench glyph: short handle + open-jaw head
      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(gx - 2.4, gy - 4.2);
      ctx.lineTo(gx + 2.8, gy + 0.8);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(gx - 1.6, gy - 1.6, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(gx - 2.6, gy - 2.6);
      ctx.lineTo(gx - 0.4, gy - 0.4);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
    // Police stations — pulsing blue shield badges (where a busted player
    // respawns), so players can find the nearest station after a bust.
    if (Math.hypot(this.carX - this._mapPoliceCenterX, this.carZ - this._mapPoliceCenterZ) > 40 || this._mapPoliceStations.length === 0) {
      this._mapPoliceCenterX = this.carX;
      this._mapPoliceCenterZ = this.carZ;
      this._mapPoliceStations = this.renderer.getPoliceStationsNear(this.carX, this.carZ, 310);
    }
    for (const ps of this._mapPoliceStations) {
      const px = cx + (ps.x - this.carX) * scale;
      const py = cy + (ps.z - this.carZ) * scale;
      if (px < -10 || px > 310 || py < -10 || py > 310) continue;
      const pulse = 5 + Math.sin(now / 300) * 1.2;
      ctx.fillStyle = 'rgba(80, 140, 255, 0.22)';
      ctx.beginPath(); ctx.arc(px, py, 7 + pulse, 0, Math.PI * 2); ctx.fill();
      // Shield badge: pointed top, flared sides, rounded bottom.
      ctx.fillStyle = '#4488ff';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, py - 5.5);
      ctx.lineTo(px + 4.5, py - 2.5);
      ctx.lineTo(px + 4, py + 3.5);
      ctx.lineTo(px, py + 6);
      ctx.lineTo(px - 4, py + 3.5);
      ctx.lineTo(px - 4.5, py - 2.5);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Small white star on the badge.
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 2.8 : 1.2;
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        const sx = px + Math.cos(a) * r;
        const sy = py + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      }
      ctx.closePath(); ctx.fill();
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
    // Dealership NPCs — orange "D" markers
    if (this.dealershipNPCs && this.dealershipNPCs.length > 0) {
      for (const npc of this.dealershipNPCs) {
        const mx = cx + (npc.x - this.carX) * scale;
        const my = cy + (npc.z - this.carZ) * scale;
        ctx.fillStyle = '#ff8800';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        const sz = 5;
        ctx.beginPath(); ctx.arc(mx, my, sz, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('D', mx, my);
      }
    }
    // Dealership active missions guidance
    if (this.dealershipMission) {
      const m = this.dealershipMission;
      if (m.state === 'search' && this.dealershipTargetCar) {
        const mx = cx + (this.dealershipTargetCar.x - this.carX) * scale;
        const my = cy + (this.dealershipTargetCar.z - this.carZ) * scale;
        ctx.strokeStyle = 'rgba(255, 136, 0, 0.7)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(mx, my); ctx.stroke();
        ctx.setLineDash([]);
        const pulse = 5 + Math.sin(performance.now() / 200) * 2;
        ctx.strokeStyle = '#ff8800';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(mx, my, pulse, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ff8800';
        ctx.beginPath(); ctx.arc(mx, my, 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('S', mx, my + 12);
      }
      if (m.state === 'return') {
        const rx = cx + (m.npcX - this.carX) * scale;
        const ry = cy + (m.npcZ - this.carZ) * scale;
        ctx.strokeStyle = 'rgba(0, 255, 100, 0.7)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(rx, ry); ctx.stroke();
        ctx.setLineDash([]);
        const pulse = 5 + Math.sin(performance.now() / 200) * 2;
        ctx.strokeStyle = '#00ff64';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(rx, ry, pulse, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#00ff64';
        ctx.beginPath(); ctx.arc(rx, ry, 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('R', rx, ry + 12);
      }
    }
    // Jump ramps — show the active gameplay ramp collection so markers cannot
    // drift from the ramps used by collision detection and world rendering.
    const jumpRamps = this.renderer?.jumpRamps?.length ? this.renderer.jumpRamps : JUMP_RAMPS;
    for (const jr of jumpRamps) {
      const mx = cx + (jr.x - this.carX) * scale;
      const my = cy + (jr.z - this.carZ) * scale;
      if (mx < -20 || mx > 320 || my < -20 || my > 320) continue;
      const pulse = 6 + Math.sin(now / 350 + jr.id) * 2;
      ctx.fillStyle = 'rgba(0, 210, 255, 0.25)';
      ctx.beginPath(); ctx.arc(mx, my, pulse + 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0, 210, 255, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(mx, my, pulse, 0, Math.PI * 2); ctx.stroke();
      // Draw a ramp glyph directly on the canvas; emoji fonts vary by device.
      ctx.fillStyle = '#00d2ff';
      ctx.beginPath();
      ctx.moveTo(mx - 5, my + 3);
      ctx.lineTo(mx + 5, my + 3);
      ctx.lineTo(mx + 2, my - 4);
      ctx.lineTo(mx - 1, my - 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(jr.id), mx, my + 1);
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
  closeLoginPanel() {
    // The login overlay is a child view. Re-running Angular initialization here
    // creates a second polling chain and can recurse through NPC responses.
    this.restorePlayerState();
    this.restoreGtSettings();
  }
  // ── High-scores leaderboard (persistent kills / deaths / money) ────────────
  toggleLeaderboard() {
    this.showLeaderboard = !this.showLeaderboard;
    if (this.showLeaderboard) {
      if (this.lbTab === 'scores') this.loadHighScores();
      else if (this.lbTab === 'jumps') this.loadJumps();
      this.startHsRefresh();
    } else {
      this.stopHsRefresh();
    }
  }
  setLbTab(tab: 'live' | 'scores' | 'jumps') {
    this.lbTab = tab;
    if (!this.showLeaderboard) return;
    if (tab === 'scores') this.loadHighScores();
    else if (tab === 'jumps') this.loadJumps();
  }
  setHsSort(sort: 'kills' | 'deaths' | 'money' | 'earned' | 'score' | 'escapes' | 'busted' | 'resists' | 'worstStreak') {
    if (this.hsSort === sort) return;
    this.hsSort = sort;
    this.loadHighScores();
  }
  private startHsRefresh() {
    this.stopHsRefresh();
    this._hsTimer = setInterval(() => {
      if (!this.showLeaderboard) { this.stopHsRefresh(); return; }
      if (this.lbTab === 'scores') this.loadHighScores();
      else if (this.lbTab === 'jumps') this.loadJumps();
    }, 30000);
  }
  private stopHsRefresh() {
    if (this._hsTimer) { clearInterval(this._hsTimer); this._hsTimer = null; }
  }
  private async loadHighScores() {
    if (this._destroyed) return;
    // Always clear stale rows while a new request is loading so an empty or
    // delayed response cannot leave the popup looking broken.
    this.highScores = [];
    // Request token: rapid sort/tab switches must not let a stale response win.
    const reqId = ++this._hsReqId;
    this.hsLoading = true;
    try {
      const res = await this.gtService.getHighScores(this.hsSort, this.getUserId());
      if (this._destroyed || reqId !== this._hsReqId) return;
      if (res) {
        const rawResults: any = (res as any).results ?? (res as any).highScores ?? (res as any).rows ?? [];
        const results = Array.isArray(rawResults) ? rawResults : [];
        // Accept both the PascalCase JSON emitted by older server builds and
        // the camelCase shape used by the current API. Without this mapping,
        // Angular receives rows but all bindings evaluate to undefined.
        this.highScores = results.map((entry: any) => ({
          playerId: Number(entry.playerId ?? entry.PlayerId ?? entry.userId ?? entry.UserId ?? 0),
          playerName: String(entry.playerName ?? entry.PlayerName ?? entry.username ?? entry.Username ?? 'Unknown'),
          kills: Number(entry.kills ?? entry.Kills ?? 0),
          deaths: Number(entry.deaths ?? entry.Deaths ?? 0),
          escapes: Number(entry.escapes ?? entry.Escapes ?? 0),
          busted: Number(entry.busted ?? entry.Busted ?? 0),
          resists: Number(entry.resists ?? entry.Resists ?? 0),
          worstStreak: Number(entry.worstStreak ?? entry.WorstStreak ?? entry.worst_streak ?? 0),
          money: Number(entry.money ?? entry.Money ?? 0),
          moneyEarned: Number(entry.moneyEarned ?? entry.MoneyEarned ?? entry.money_earned ?? 0),
          score: Number(entry.score ?? entry.Score ?? 0),
        }));
        this.hsTotal = Number((res as any).totalCount ?? (res as any).TotalCount ?? this.highScores.length);
        this.hsUserRank = Number((res as any).userRank ?? (res as any).UserRank ?? 0);
      }
    } finally {
      if (reqId === this._hsReqId) this.hsLoading = false;
    }
  }
  trackByHighScore(index: number, item: { playerId: number }): number {
    return item ? item.playerId : index;
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
  onViewDistanceInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement)?.value);
    if (!Number.isFinite(value)) return;
    this.setViewDistance(value);
    this.saveGtSettings();
    this.cdr.detectChanges();
  }

  setViewDistance(dist: number) {
    this.viewDistance = Math.min(1000, Math.max(100, Number(dist) || 500));
    // Generate the newly-revealed chunks off to the side (debounced) so the
    // first frame after raising the slider doesn't hitch while building them.
    if (this._prewarmTimer) clearTimeout(this._prewarmTimer);
    this._prewarmTimer = setTimeout(() => {
      this._prewarmTimer = null;
      const radius = Math.max(1, Math.min(4, Math.round(this.viewDistance / 250)));
      this.renderer.prewarmChunks(Math.floor(this.carX / 80), Math.floor(this.carZ / 80), radius);
    }, 200);
  }
  private onCanvasTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.clientX < rect.left + rect.width * 0.48 && this.joystickId === -1) {
        this.joystickId = t.identifier; this.joystickActive = true;
        this.updateThumb(t.clientX, t.clientY);
      }
      if (t.clientX >= rect.left + rect.width * 0.48 && this.touchCamId === -1) {
        this.touchCamId = t.identifier; this.touchCamLastX = t.clientX; this.touchCamLastY = t.clientY;
      }
    }
  };
  private onCanvasTouchMove = (e: TouchEvent) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === this.joystickId) {
        this.updateThumb(t.clientX, t.clientY);
      }
      if (t.identifier === this.touchCamId) {
        this.lastMouseMoveTime = performance.now();
        this.camYaw -= (t.clientX - this.touchCamLastX) * 0.005;
        this.camPitch += (t.clientY - this.touchCamLastY) * 0.005;
        this.camPitch = Math.max(-1.2, Math.min(0.8, this.camPitch));
        this.touchCamLastX = t.clientX; this.touchCamLastY = t.clientY;
      }
    }
  };
  private onCanvasTouchEnd = (e: TouchEvent) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === this.joystickId) {
        this.joystickId = -1;
        this.joystickActive = false;
        this.resetJoystick();
      }
      if (t.identifier === this.touchCamId) { this.touchCamId = -1; }
    }
  };
  private onDocTouchStart = (e: TouchEvent) => {
    const target = e.target as HTMLElement;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    if (target && (target.id === 'gt-mobile-fire' || target.id === 'gt-mobile-car' || target.id === 'gt-mobile-view')) {
      return;
    }
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.clientX < rect.left + rect.width * 0.48 && this.joystickId === -1) {
        this.joystickId = t.identifier; this.joystickActive = true;
        this.updateThumb(t.clientX, t.clientY);
      }
      if (t.clientX >= rect.left + rect.width * 0.48 && this.touchCamId === -1) {
        this.touchCamId = t.identifier; this.touchCamLastX = t.clientX; this.touchCamLastY = t.clientY;
      }
    }
  };
  private onDocTouchMove = (e: TouchEvent) => {
    const target = e.target as HTMLElement;
    if (target && (target.id === 'gt-mobile-fire' || target.id === 'gt-mobile-car' || target.id === 'gt-mobile-view')) {
      return;
    }
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === this.joystickId) {
        this.updateThumb(t.clientX, t.clientY);
      }
      if (t.identifier === this.touchCamId) {
        this.lastMouseMoveTime = performance.now();
        this.camYaw -= (t.clientX - this.touchCamLastX) * 0.005;
        this.camPitch += (t.clientY - this.touchCamLastY) * 0.005;
        this.camPitch = Math.max(-1.2, Math.min(0.8, this.camPitch));
        this.touchCamLastX = t.clientX; this.touchCamLastY = t.clientY;
      }
    }
  };
  private onDocTouchEnd = (e: TouchEvent) => {
    const target = e.target as HTMLElement;
    if (target && (target.id === 'gt-mobile-fire' || target.id === 'gt-mobile-car' || target.id === 'gt-mobile-view')) {
      return;
    }
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === this.joystickId) {
        this.joystickId = -1;
        this.joystickActive = false;
        this.resetJoystick();
      }
      if (t.identifier === this.touchCamId) { this.touchCamId = -1; }
    }
  };
  get isJoystickActive(): boolean {
    return this.joystickActive;
  }
  private onCanvasClick = (e: MouseEvent) => {
    if (this.showWeaponWheel) return;
    if (!this.isPointerLocked) this.canvasRef.nativeElement.requestPointerLock();
  };
  private onPointerLockChange = () => {
    this.isPointerLocked = document.pointerLockElement === this.canvasRef.nativeElement;
  };
  private onResize = () => {
    if (this.isMobile) {
      this.canvasRef.nativeElement.width = Math.floor(window.innerWidth * 0.7);
      this.canvasRef.nativeElement.height = Math.floor(window.innerHeight * 0.7);
    } else {
      this.canvasRef.nativeElement.width = window.innerWidth;
      this.canvasRef.nativeElement.height = window.innerHeight;
    }
    this.renderer.resize(this.canvasRef.nativeElement.width, this.canvasRef.nativeElement.height);
  };
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD' || e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'Space') {
      e.preventDefault();
    }
    this.keys.add(e.code);
    if (e.code === 'Space') { e.preventDefault(); this.altUpPressed = true; }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.altDownPressed = true;
    if (this.isChatOpen) {
      if (e.code === 'Enter') { this.sendChatMessage(); }
      if (e.code === 'Escape') { this.isChatOpen = false; this.chatInput = ''; }
      return;
    }
    if (e.code === 'Enter') { this.isChatOpen = true; this.chatInput = ''; e.preventDefault(); return; }
    if (e.code === 'KeyE') this.toggleCar();
    if (e.code === 'KeyR' && this.isInCar && this.vehicleType === 'police') this.togglePoliceMode();
    if (e.code === 'KeyV') this.toggleView();
    if (e.code === 'KeyM') this.toggleMap();
    if (e.code === 'KeyL') this.toggleLeaderboard();
    if (this.isInCar && !this.isMobile) {
      if (e.code === 'ArrowUp') { e.preventDefault(); this.stopRadio(); }
      if (e.code === 'ArrowDown') { e.preventDefault(); this.randomRadio(); }
      if (e.code === 'ArrowLeft') { e.preventDefault(); this.prevRadio(); }
      if (e.code === 'ArrowRight') { e.preventDefault(); this.nextRadio(); }
    }
    if (e.code === 'Tab' || e.code === 'KeyR') {
      if (e.code === 'KeyR' && this.dealershipMission != null) {
        this.stopDealershipMission();
      }
      else if (this.nearDealerNPC && this.dealershipMission === null) {
        this.startDealershipMission();
      } else {
        e.preventDefault();
        this.showWeaponWheel = !this.showWeaponWheel;
        if (this.isPointerLocked) document.exitPointerLock();
      }
    }
    if (e.code === 'Escape') {
      this.showWeaponWheel = false;
      this.showLeaderboard = false;
      this.stopHsRefresh();
    }
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    if (e.code === 'Space') this.altUpPressed = false;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.altDownPressed = false;
  };
  private clearMovementInput = () => {
    this.keys.clear();
    this.altUpPressed = false;
    this.altDownPressed = false;
    this.joystickActive = false;
    this.joystickId = -1;
    this.resetJoystick();
    this.carVx = 0;
    this.carVz = 0;
    this.carSpeed = 0;
  };
  private onInputBlur = () => this.clearMovementInput();
  private onInputVisibilityChange = () => {
    if (document.hidden) this.clearMovementInput();
  };
  private onMouseMove = (e: MouseEvent) => {
    if (!this.isPointerLocked) return;
    this.lastMouseMoveTime = performance.now();
    this.camYaw -= e.movementX * 0.002;
    this.camPitch += e.movementY * 0.002;
    this.camPitch = Math.max(-1.2, Math.min(0.8, this.camPitch));
  };
  private onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0 || this.showWeaponWheel) return;
    this.unlockAudio();
    this.isShooting = true;
    this.shoot();
    this.startAutoFire();
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) {
      this.isShooting = false;
      this.stopAutoFire();
    }
  };
  private onMouseLeave = () => {
    this.isShooting = false;
    this.stopAutoFire();
  };
}