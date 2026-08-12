import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppModule } from '../app.module';
import { ChildComponent } from '../child.component';
import { RacingRenderer, TrackPoint, DECAL_LAYOUTS, getAccentSegsForStyle } from './racing-renderer';
import { RacingService } from '../../services/racing.service';
import { RacingHubService, LobbyPlayer, RemoteCarPosition, RaceStandingsRow, RaceGridSlot } from '../../services/racing-hub.service';
import {
  RacingPlayerCar, RaceResult, RacingAppearancePart,
  TRACKS, UPGRADE_DEFS, CAR_SKINS, BOT_CONFIGS, APPEARANCE_PARTS, TrackDefinition,
  RIM_TINTS, DECAL_COLORS, GLOW_COLORS, ACCENT_COLORS, SKIN_FINISH_FACTOR, RacingCarAppearance,
  SPOILER_DOWNFORCE, SPOILER_DRAG
} from '../../services/datacontracts/racing/racing-types';
import { UserEventService } from '../../services/user-event.service';
import { Subscription } from 'rxjs';
interface ReplayCar {
  x: number; z: number; yaw: number; speed: number; accel: number; slide: number;
  id: string; r: number; g: number; b: number;
  dist: number;   
  name: string;   
}
interface ReplayFrame {
  t: number; 
  px: number; pz: number; pyaw: number; pspd: number; pacc: number; pslid: number;
  pdist: number; 
  cars: ReplayCar[];
}
// Replay frame storage as a fixed-capacity ring buffer: the old implementation
// kept a plain array and shift()ed it once full (6000 frames), which is O(n)
// per frame after ~100s of racing — a constant cost in the hot loop. push()
// here is O(1) always: the oldest frame is simply overwritten.
class ReplayFrameBuffer {
  private readonly data: ReplayFrame[];
  private head = 0;
  private count = 0;
  constructor(private readonly capacity: number) {
    this.data = new Array<ReplayFrame>(capacity);
  }
  get length(): number { return this.count; }
  /** Append a frame; when full, silently drops the oldest (keeps the last
   *  `capacity` frames — same as the old shift-based cap). O(1). */
  push(frame: ReplayFrame) {
    this.data[this.head] = frame;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }
  /** Frame at chronological index i (0 = oldest). Callers must keep i < length. */
  at(i: number): ReplayFrame {
    const idx = (this.head - this.count + i + this.capacity) % this.capacity;
    return this.data[idx];
  }
  /** Most recent frame. */
  last(): ReplayFrame {
    return this.at(this.count - 1);
  }
  clear() {
    this.count = 0;
    this.head = 0;
  }
}
const ACCEL = 35;
const BRAKE_FORCE = 40;
const BRAKE_HEAT_FADE_ON = 0.85;      
const BRAKE_HEAT_FADE_TOP = 1.35;     
const BRAKE_HEAT_FADE_AMOUNT = 0.4;   
const BRAKE_LOCK_UNDERSTEER = 0.3;    
const BRAKE_LOCK_DECEL_LOSS = 0.1;    
const FRICTION = 0.97;
const MAX_SPEED_BASE = 55;
const TURN_SPEED = 0.38;
const OFF_TRACK_DRAG = 0.92;
const CURB_DRAG = 0.96;
const LAT_ACCEL = 30;
const MAX_RACK_YAW = 2.6;
const SLIP_FULL = 0.45;
const SLIP_DRAG = 1.8;
const WRONG_WAY_SPEED_DRAIN = 60;  
const WRONG_WAY_YAW_RATE = 1.9;    
const WRONG_WAY_PULL_SPEED = 5;    
const SLIP_GRIP_CUT = 0.65;
const AI_LOOKAHEAD = 3;
const CAR_RADIUS = 1.1;
// How long an NPC's pace stays dented after being hit by another car, and the
// shared bot paint palette (kept in sync with the inline palette used when
// building the render car list) so paint chips match the car they flew off.
const HIT_SLOW_MAX = 1.5;
const BOT_PAINT: [number, number, number][] = [
  [0.8, 0.2, 0.2], [0.2, 0.4, 0.9], [0.1, 0.7, 0.1],
  [0.9, 0.7, 0.1], [0.7, 0.2, 0.7], [1.0, 0.5, 0],
];
// Hoisted ONCE at module load. botAppearanceFor runs per bot/remote/replay car
// EVERY frame, and Object.keys(...).map(Number) on these large catalogs (16-31
// entries each) allocated ~48 arrays per frame of pure GC churn — a real
// frame-time tax on mobile. The id lists never change, so compute them once.
const RIM_TINT_IDS = Object.keys(RIM_TINTS).map(Number);
const DECAL_COLOR_IDS = Object.keys(DECAL_COLORS).map(Number);
const ACCENT_COLOR_IDS = Object.keys(ACCENT_COLORS).map(Number);
const GLOW_COLOR_IDS = Object.keys(GLOW_COLORS).map(Number);
interface BotCar {
  id: string;   
  dist: number;
  speed: number;
  yaw: number;
  x: number;
  z: number;
  lap: number;
  name: string;
  color: number;
  config: any;
  mistakeTimer: number;
  hasMistake: boolean;
  alive: boolean;
  laneOffset: number;
  raceDist: number;
  pace: number;
  slide: number;
  brakeCommitment?: number;
  // Rim bumps: brief hard curb slowdown when drifting wide, then re-center.
  rimBumpTimer: number;
  // Catastrophic corner crashes: rare loss-of-control spin, then recovery.
  crashTimer: number;
  crashSpinDir: number;
  crashDuration: number;
  // Seconds of pace loss after being hit by another car (recovers to full).
  hitSlowTimer: number;
  // Leaderboard lap timing: stable negative player id (one per bot name, so the
  // server aggregates each bot's best lap across races), the timestamp the current
  // lap started, and the bot's best lap in ms — the race result carries the whole
  // grid so the Best Laps panel shows the field, not just the human.
  pid: number;
  lapStart: number;
  bestLap: number;
}
interface RemoteAudioVoice {
  engineOsc: OscillatorNode;
  engineFilter: BiquadFilterNode;
  engineGain: GainNode;
  screechSource: AudioBufferSourceNode;
  screechFilter: BiquadFilterNode;
  screechGain: GainNode;
}
interface RemoteCarVisual {
  connectionId: string;
  playerName: string;
  playerId: number;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  distance: number;
  currentLap: number;
  isOffTrack: boolean;
  colorR: number;
  colorG: number;
  colorB: number;
  lap: number;
  slide: number;
  raceDist?: number;
}
// Reused per-frame render slot — the live race carList used to build a fresh
// object literal per bot/remote/player car (plus an appearance spread) every
// frame, which churned the GC on mobile. Slots are filled in place and only
// the filled ones are pushed as references; the renderer reads them
// synchronously and never retains them.
interface CarListSlot extends RacingCarAppearance {
  x: number; y: number; z: number; yaw: number;
  r: number; g: number; b: number;
  speed: number; accel: number; spin: number; slide: number;
  id: string; bank: number;
}
@Component({
  selector: 'app-racing',
  templateUrl: './racing.component.html',
  styleUrl: './racing.component.css',
  standalone: true,
  imports: [AppModule, CommonModule, FormsModule],
})
export class RacingComponent extends ChildComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('raceCanvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('garageStage', { static: false }) garageStageEl?: ElementRef<HTMLDivElement>;
  renderer!: RacingRenderer;
  private animId = 0;
  private lastTime = 0;
  isLoaded = false;
  gameState: 'menu' | 'garage' | 'countdown' | 'racing' | 'paused' | 'finished' = 'menu';
  selectedTrack: TrackDefinition | null = null;
  selectedTab: 'menu' | 'upgrades' | 'skins' | 'appearance' | 'records' = 'menu';
  currentLap = 0;
  totalLaps = 3;
  countdownTimer = 0;
  private _raceFinished = false;
  private _replayFrames = new ReplayFrameBuffer(6000);
  private _replayTime = 0;   
  private _replaySpins = new Map<string, number>();
  // Exact appearance each recorded car wore during the live race, keyed by replay id
  // ('b<idx>' for bots, 'r<connectionId>' for remotes) — used so playback shows the
  // same livery instead of re-seeding a different look from the id string.
  private _replayAppearances = new Map<string, RacingCarAppearance>();
  private _replayTrailArmed = false;
  // Appearance-seed caches (computed once, not per frame): remote seeds derive
  // from the connectionId (immutable), replay seeds from the replay car id.
  private _remoteSeedCache = new Map<string, number>();
  private _replaySeedCache = new Map<string, number>();
  replayPaused = false;
  replayScrubDir = 0;               
  private _replayDragging = false;
  private static readonly REPLAY_SCRUB_RATE = 3; 
  replayProgressPct = 0;
  replayTimeLabel = '0:00.0';
  replayDurationLabel = '0:00.0';
  private _replayUiTimer: any = null;
  replayCam = 0;
  private static readonly REPLAY_CAM_MS = 10000;
  replayLeadName = '';
  get replayCamName(): string {
    const base = ['ORBIT CAM', 'CHASE CAM', 'AERIAL CAM', 'LEADER CAM'][this.replayCam] ?? '';
    if (this.replayCam === 3 && this.replayLeadName) return `${base} · ${this.replayLeadName}`;
    // Standings-selected follow target (cams 0-2 chase that racer instead).
    if (this.isFollowingRacer) return `${base} · ${this.replayFollowName}`;
    return base;
  }
  racePosition = 1;
  totalRacers = 1;
  playerCar: RacingPlayerCar = {
    userId: 0, playerName: '', upgrades: [], skinId: 1, spoilerId: 0, rimId: 0, exhaustId: 0, decalId: 0,
    glowId: 0, accentId: 0, glowIntensity: 50,
    totalRaces: 0, wins: 0, money: 500, bestLap: 0, totalEarnings: 0
  };
  carX = 0; carZ = 0; carYaw = 0; carSpeed = 0;
  carAccel = 0; carSteer = 0;
  carDir = 0;
  slipAngle = 0;
  carDist = 0; lapTimes: number[] = [];
  private lastCarDist = 0;
  private _playerRaceDist = 0;
  lapStartTime = 0; lastLapTime = 0; raceStartTime = 0;
  totalRaceTime = 0; bestLapTime = 0;
  isOffTrack = false; offTrackTimer = 0;
  wrongWay = false;
  private _wrongWayTimer = 0;
  private _wrongWayShown = false;
  private _wrongWaySliding = false;
  private _wasOnWall = false;
  private _carImpactCooldown = 0;
  private _botImpactCooldown = 0;
  bots: BotCar[] = [];
  private _countdownInterval: any = null;
  showMultiplayer = false;
  lobbyPlayers: LobbyPlayer[] = [];
  isLobbyHost = false;
  amReady = false;
  trackIdStr = '';
  remoteCars: Map<string, RemoteCarVisual> = new Map();
  lobbyConnectionError = '';
  chatMessages: { playerName: string; message: string }[] = [];
  chatInput = '';
  autoStartSeconds = 0;
  mpCountdownTimer = 0;
  private _mpStartCountdownTimer: any = null;
  private _mpRaceStartAt = 0;
  private _autoStartTicker: any = null;
  private autoStartDeadline = 0;
  private _autoStartTotalMs = 0;
  private _mpSubs: Subscription[] = [];
  private _positionSyncTimer = 0;
  private _mpLobbyTrackId = '';
  // Server-authoritative F1 starting grid for the current multiplayer race
  // (slot 0 = pole, least upgraded car; most upgraded starts at the back).
  private _mpGrid: RaceGridSlot[] = [];
  private _mpFinished = false;
  private _mpWinnerCelebrated = false;
  keys = new Set<string>();
  isMobile = false;
  joyActive = false;
  joyX = 0;
  joyY = 0;
  private joyOriginX = 0;
  private joyOriginY = 0;
  private joyBaseCenterX = 0;
  private joyBaseCenterY = 0;
  private readonly joyRadius = 46;
  private readonly joyThumbTravel = 48;
  @ViewChild('joyThumb') joyThumbEl?: ElementRef<HTMLDivElement>;
  @ViewChild('joyZone') joyZoneEl?: ElementRef<HTMLDivElement>;
  keyboardSteerCurrent = 0;
  gasHeld = false;
  brakeHeld = false;
  leaderboard: RaceResult[] = [];
  leaderboardTotal = 0;
  leaderboardUserRank = 0;
  leaderboardBestLap = 0;
  allTrackBoards: {
    trackId: number; totalCount: number; bestLap: number;
    userLap: number; userRank: number; results: RaceResult[];
  }[] = [];
  allTracksLoading = false;
  // True when the leaderboard endpoints answered with an unexpected shape and
  // no fallback produced data (e.g. a mock/test backend without those routes) —
  // the panel shows a clear notice instead of implying no laps exist.
  leaderboardDataUnavailable = false;
  // All Circuits cards: per-track collapse + 'show top 20' state.
  collapsedTrackBoards: Set<number> = new Set();
  trackBoardShowTop20: Set<number> = new Set();
  trackSearch = '';
  private preSearchCollapsed: Set<number> | null = null;
  private _lastBotCrashCheer: number | null = null;
  rankMovement = 0;
  racerProfile: { playerId: number; playerName: string; car: RacingPlayerCar | null; loading: boolean } | null = null;
  showLeaderboard = false;
  get hubConnected(): boolean { return this.racingHub.connected; }
  get myConnectionId(): string | null { return this.racingHub.myConnectionId; }
  get myLobbyName(): string {
    return this.playerCar.playerName?.trim() || this.parentRef?.user?.username || 'Player';
  }
  isMyChatMessage(c: { playerName: string; message: string }): boolean {
    return c.playerName === this.myLobbyName;
  }
  get readyCount(): number {
    return this.lobbyPlayers.filter(p => p.ready).length;
  }
  get isInMultiplayerRace(): boolean { return !!this._mpLobbyTrackId; }
  mpConnecting = false;
  get mpStatusText(): string {
    if (this.hubConnected) return 'Connected';
    if (this.mpConnecting) return 'Connecting…';
    return 'Not connected';
  }
  messages: string[] = [];
  recordToast: { old: number; new: number; trackId: number } | null = null;
  private _recordToastTimer: any = null;
  beatFriendToast: { friendName: string; margin: number; trackId: number } | null = null;
  private _beatFriendToastTimer: any = null;
  private msgTimer: any = null;
  hudSpeed = 0;
  hudRPM = 0;
  hudBrakeHeat = 0;
  _brakePeakThisLap = 0;
  hudWheelLock = 0;
  steerSmoothed = 0;
  liveLapTime = 0;
  @ViewChild('steerWheel') steerWheelEl?: ElementRef<HTMLDivElement>;
  @ViewChild('wheelSpeed') wheelSpeedEl?: ElementRef<HTMLDivElement>;
  @ViewChild('cockpitDash') cockpitDashEl?: ElementRef<HTMLDivElement>;
  @ViewChild('wheelRpm') wheelRpmEl?: ElementRef<HTMLDivElement>;
  @ViewChild('wheelGear') wheelGearEl?: ElementRef<HTMLDivElement>;
  @ViewChild('thrFill') thrFillEl?: ElementRef<HTMLSpanElement>;
  @ViewChild('brkFill') brkFillEl?: ElementRef<HTMLSpanElement>;
  @ViewChild('brakeFill') brakeFillEl?: ElementRef<HTMLDivElement>;
  @ViewChild('brakePeak') brakePeakEl?: ElementRef<HTMLDivElement>;
  @ViewChild('brakeGauge') brakeGaugeEl?: ElementRef<HTMLDivElement>;
  @ViewChild('brakeState') brakeStateEl?: ElementRef<HTMLSpanElement>;
  @ViewChild('wheelLeds') wheelLedsEl?: ElementRef<HTMLDivElement>;
  @ViewChild('wheelLedFL') wheelLedFlEl?: ElementRef<HTMLDivElement>;
  @ViewChild('wheelLedFR') wheelLedFrEl?: ElementRef<HTMLDivElement>;
  private _audioCtx: AudioContext | null = null;
  private _destroyed = false;
  private _onKeyDown: (e: KeyboardEvent) => void = () => { };
  private _onKeyUp: (e: KeyboardEvent) => void = () => { };
  private _initAudio: () => void = () => { };
  // Mobile gesture blockers: swallow pinch-zoom, double-tap zoom and long-press
  // callouts that would otherwise zoom/select the page while the game is open.
  // Bound to this component's host element, active only on touch devices, and
  // removed in ngOnDestroy so nothing leaks after closing the game.
  private _raceRootEl: HTMLElement | null = null;
  private _onGestureStart: (e: Event) => void = () => { };
  private _onGestureChange: (e: Event) => void = () => { };
  private _onGestureEnd: (e: Event) => void = () => { };
  private _onDblClick: (e: Event) => void = () => { };
  private _onContextMenu: (e: Event) => void = () => { };
  private _subOsc: OscillatorNode | null = null;
  private _engineOsc: OscillatorNode | null = null;
  private _engineOsc2: OscillatorNode | null = null;
  private _harmOsc: OscillatorNode | null = null;
  private _engineFilter: BiquadFilterNode | null = null;
  private _thrumLfo: OscillatorNode | null = null;
  private _thrumLfoGain: GainNode | null = null;
  private _engineGain: GainNode | null = null;
  private _windSource: AudioBufferSourceNode | null = null;
  private _windFilter: BiquadFilterNode | null = null;
  private _windGain: GainNode | null = null;
  private _crowdSource: AudioBufferSourceNode | null = null;
  private _crowdFilter: BiquadFilterNode | null = null;
  private _crowdFilter2: BiquadFilterNode | null = null;
  private _crowdGain: GainNode | null = null;
  private _nextCrowdFxAt = 0;
  private static readonly GRANDSTAND_FRACS = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875];
  private static readonly CROWD_REACH = 55;
  private static readonly STAND_ROAR_SPEED = 28;   
  private static readonly STAND_ROAR_COOLDOWN = 2200; 
  private _prevLapFrac = -1;      
  private _lastStandRoarAt = 0;   
  private _lastTickSecond = -1;   
  private _lastStandingsTickSecond = -1; 
  private _prevBotSpeeds = new Map<BotCar, number>();
  // Reused car-list array + slot pool for the live race frame (see CarListSlot).
  private _carListArr: CarListSlot[] = [];
  private _carSlots: CarListSlot[] = [];
  // Reused collision-list slots — the player-car check used to build a fresh
  // array + object per bot/remote EVERY frame (pure GC churn on mobile, in the
  // exact cornering path where cars bunch up).
  private _nearbyCarSlots: { x: number; z: number; yaw: number; speed: number; isBot: boolean; ref: any }[] = [];
  private _prevRemoteSpeeds = new Map<string, number>();
  private _botSpins = new Map<BotCar, number>();
  private _remoteSpins = new Map<string, number>();
  private _playerSpin = 0;
  private _screechSource: AudioBufferSourceNode | null = null;
  private _screechFilter: BiquadFilterNode | null = null;
  private _screechGain: GainNode | null = null;
  private _squealSource: AudioBufferSourceNode | null = null;
  private _squealFilter: BiquadFilterNode | null = null;
  private _squealGain: GainNode | null = null;
  private _squealRingOsc: OscillatorNode | null = null;
  private _squealRingGain: GainNode | null = null;
  private _playerSlide = 0;
  // Grid rev during the start countdown (0..1): the throttle revs the engine
  // (audio + RPM gauge + exhaust glow) without moving the parked car.
  private _countdownRev = 0;
  // Perfect-launch timing: timestamp of the player's last gas press. A launch
  // at the lights counts as "perfectly timed" when the throttle was (re-)engaged
  // within a short window of GO while the engine was revved — holding gas the
  // whole countdown never counts, so the GO flash is the real cue.
  private _gasPressAt = 0;
  private _launchBoostTimer = 0;
  private _launchFlashTimer: any = undefined;
  perfectLaunchFlash = 0;
  // Countdown cinematic: orbit the starting grid while the lights count down
  // so the field stays visible, then blend back into the cockpit camera at GO.
  private _countdownPanStartAt = 0;
  private _lastPanCam: { eyeX: number; eyeY: number; eyeZ: number; yaw: number; pitch: number } | null = null;
  private static readonly COUNTDOWN_PAN_MS = 10000;
  private _remoteVoices: RemoteAudioVoice[] = [];
  private static readonly REMOTE_AUDIBLE = 55;
  private static readonly MAX_REMOTE_VOICES = 10;
  podiumData: { playerName: string; totalTime: number; moneyEarned: number }[] = [];
  finalStandings: { position: number; name: string; playerId: number; isBot: boolean; isPlayer: boolean; isDnf: boolean; isEstimated: boolean; color: string; laps: number; totalTimeMs: number; replayId?: string }[] = [];
  standingsCollapsed = false;
  /** Replay follow target: replay car id ('b<i>' bot, 'r<conn>' remote,
   *  'replay-player') selected from the final standings. Null = follow yourself. */
  replayFollowId: string | null = null;
  replayFollowName = '';
  private _lastRaceTotalTime = 0;
  serverStandings: RaceStandingsRow[] | null = null;
  /** Live 'Results shown for 0:04' countdown text while the standings window is open. */
  standingsCountdownText = '';
  /** 0-100 fill of the standings window progress bar. */
  standingsProgress = 100;
  /** True when <3s remain — triggers the subtle urgent pulse. */
  standingsLow = false;
  /** True for a beat right after each final-3s tick — flashes the panel border
   *  in sync with the audible tick so the countdown reads visually too. */
  standingsTickFlash = false;
  private _standingsFlashTimer: any = null;
  private _standingsDeadline = 0;
  private _standingsTotalMs = 0;
  private _standingsTimer: number | null = null;
  dnfRacers: { name: string; playerId: number; color: string }[] = [];
  private _baseFov = 1.1;
  screenShake = 0;
  isRaining = false;
  soundOn = false;
  showOptions = false;
  cameraShakeOn = true;
  speedFovOn = true;
  /** Opt-in frame-budget profiler (?profile=1) — logs per-subsystem ms/frame
   *  to the console every ~120 frames so a session can be driven through
   *  corners and the hot costs measured. Off = one boolean check per mark. */
  profile = false;
  private _profTimes: { [key: string]: number } = {};
  private _profFrames = 0;
  private _pLast = 0;
  /** Garage live-preview toggle: when on, hovering an appearance part (accent,
   *  decal, rims, glow, …) applies it to the 3D car in real time before buying.
   *  Off keeps the car on the equipped look while browsing. Persisted. */
  garageLivePreview = true;
  constructor(
    private racingService: RacingService,
    private racingHub: RacingHubService,
    private userEventService: UserEventService,
    private ngZone: NgZone,
    private el: ElementRef,
  ) { super(); }
  ngOnInit() {
    if (typeof window !== 'undefined' && window.innerWidth < 768) this.standingsCollapsed = true;
    try { this.profile = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('profile'); } catch { }
    this.loadPlayerCar();
    try { this.soundOn = localStorage.getItem('gp_sound') === '1'; } catch { }
    try { this.cameraShakeOn = localStorage.getItem('gp_shake') !== '0'; } catch { }
    try { this.speedFovOn = localStorage.getItem('gp_fov') !== '0'; } catch { }
    try { this.garageLivePreview = localStorage.getItem('gp_livepreview') !== '0'; } catch { }
    this.restoreGarageCam();
    this.userEventService.insertUserEvent(
      this.parentRef?.user?.id ?? 0, "racing", "Started Racing!", undefined, "Racing"
    );
    this.subscribeToMultiplayer();
  }
  private subscribeToMultiplayer() {
    this._mpSubs.push(
      this.racingHub.lobbyState$.subscribe(state => {
        this.ngZone.run(() => {
          this.lobbyPlayers = state.players;
          this.isLobbyHost = state.isHost;
        });
      })
    );
    this._mpSubs.push(
      this.racingHub.playerJoined$.subscribe(p => {
        this.ngZone.run(() => {
          if (!this.lobbyPlayers.find(x => x.connectionId === p.connectionId)) {
            this.lobbyPlayers.push(p);
          }
          this.addMessage(`${p.playerName} joined!`);
        });
      })
    );
    this._mpSubs.push(
      this.racingHub.rosterUpdate$.subscribe(u => {
        this.ngZone.run(() => {
          const p = this.lobbyPlayers.find(x => x.connectionId === u.connectionId);
          if (p) p.inRace = u.inRace;
        });
      })
    );
    this._mpSubs.push(
      this.racingHub.playerLeft$.subscribe(playerName => {
        this.ngZone.run(() => {
          const wasRacing = this.gameState === 'racing';
          const lp = this.lobbyPlayers.find(p => p.playerName === playerName);
          let rcPlayerId = 0, rcColor = '';
          this.remoteCars.forEach((v, k) => {
            if (v.playerName === playerName) {
              rcPlayerId = v.playerId || 0;
              rcColor = `rgb(${Math.round(v.colorR * 255)}, ${Math.round(v.colorG * 255)}, ${Math.round(v.colorB * 255)})`;
              this.remoteCars.delete(k);
            }
          });
          this.lobbyPlayers = this.lobbyPlayers.filter(p => p.playerName !== playerName);
          if (wasRacing && !this.dnfRacers.some(d => d.name === playerName)) {
            this.dnfRacers.push({
              name: playerName,
              playerId: rcPlayerId || lp?.playerId || 0,
              color: rcColor || '#9e9e9e',
            });
          }
          this.addMessage(`${playerName} left.`);
        });
      })
    );
    this._mpSubs.push(
      this.racingHub.playerReadyChanged$.subscribe(data => {
        this.ngZone.run(() => {
          const p = this.lobbyPlayers.find(x => x.connectionId === data.connectionId);
          if (p) p.ready = data.ready;
        });
      })
    );
    this._mpSubs.push(
      this.racingHub.playerSkinChanged$.subscribe(data => {
        this.ngZone.run(() => {
          const p = this.lobbyPlayers.find(x => x.connectionId === data.connectionId);
          if (p) p.skinId = data.skinId;
        });
      })
    );
    this._mpSubs.push(
      this.racingHub.raceCountdown$.subscribe(count => {
        this.ngZone.run(() => {
          this.countdownTimer = count;
          if (count > 0 && this.gameState !== 'countdown') {
            this.closeGarageForRaceStart();
            this.gameState = 'countdown';
            this._countdownPanStartAt = performance.now();
          }
        });
      })
    );
    this._mpSubs.push(
      this.racingHub.raceStarted$.subscribe(data => {
        this.ngZone.run(() => {
          this.totalLaps = data.totalLaps;
          this._mpGrid = data.grid ?? [];
          const startAt = data.startTime;
          this.closeGarageForRaceStart();
          if (startAt && startAt > Date.now()) {
            this._mpRaceStartAt = startAt;
            this.countdownTimer = Math.max(0, Math.ceil((startAt - Date.now()) / 1000));
            this.gameState = 'countdown';
            // Line the field up on the grid the moment the lights appear, so
            // everyone sees the F1-style formation (pairs, staggered rows)
            // during the countdown instead of cars parked wherever they were.
            this.placePlayerOnGrid();
            this.preplaceRemotesOnGrid();
            this._countdownPanStartAt = performance.now();
            this.stopMpStartCountdown();
            this._mpStartCountdownTimer = setInterval(() => {
              const remain = Math.max(0, Math.ceil((this._mpRaceStartAt - Date.now()) / 1000));
              this.countdownTimer = remain;
              if (remain <= 0) {
                this.stopMpStartCountdown();
                this.beginRace();
              }
            }, 200);
          } else {
            this.beginRace();
          }
        });
      })
    );
    this._mpSubs.push(
      this.racingHub.carPositionUpdate$.subscribe(data => {
        const existing = this.remoteCars.get(data.connectionId);
        if (existing) {
          const oldLap = existing.lap;
          const oldDist = existing.distance;
          const prevYawR = existing.yaw;
          existing.x = data.x;
          existing.z = data.z;
          existing.yaw = data.yaw;
          existing.speed = data.speed;
          existing.currentLap = data.currentLap;
          existing.isOffTrack = data.isOffTrack;
          let yawDelta = data.yaw - prevYawR;
          while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
          while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
          const yawRateR = Math.abs(yawDelta) / 0.1;
          const slideEst = Math.min(1, (yawRateR / 3.5) * Math.min(1, Math.abs(data.speed) / 8));
          existing.slide = existing.slide * 0.5 + slideEst * 0.5;
          if (data.currentLap > oldLap) existing.lap = data.currentLap;
          else if (data.distance < 50 && oldDist > 100) existing.lap++;
          existing.distance = data.distance;
          if (typeof data.raceDist === 'number') existing.raceDist = data.raceDist;
        } else {
          const player = this.lobbyPlayers.find(p => p.connectionId === data.connectionId);
          this.remoteCars.set(data.connectionId, {
            connectionId: data.connectionId,
            playerName: player?.playerName || '???',
            playerId: player?.playerId || 0,
            x: data.x, z: data.z, yaw: data.yaw,
            speed: data.speed, distance: data.distance,
            currentLap: data.currentLap, isOffTrack: data.isOffTrack,
            colorR: 0.9, colorG: 0.3, colorB: 0.3,
            lap: data.currentLap || 0,
            slide: 0,
            raceDist: typeof data.raceDist === 'number' ? data.raceDist : undefined,
          });
          this.totalRacers = this.bots.length + this.lobbyPlayers.length;
        }
      })
    );
    this._mpSubs.push(
      this.racingHub.playerFinished$.subscribe(data => {
        this.ngZone.run(() => {
          this.addMessage(`${data.playerName} finished #${data.position}!`);
        });
      })
    );
    this._mpSubs.push(
      this.racingHub.raceStandings$.subscribe(rows => {
        this.ngZone.run(() => {
          this.serverStandings = rows;
          this.applyServerStandings();
        });
      })
    );
    this._mpSubs.push(
      this.racingHub.raceWinner$.subscribe(winner => {
        this.ngZone.run(() => {
          if (!winner || !this._mpLobbyTrackId) return;
          const myId = this.parentRef?.user?.id ?? 0;
          if (winner.playerId === myId) {
            if (this._mpWinnerCelebrated) return;
            this._mpWinnerCelebrated = true;
            this.renderer.celebrateWinner(Math.abs(this.carSpeed));
            this.renderer.exciteCrowd(1);
            this.playWinnerCheer();
          } else {
            if (this.gameState !== 'finished' && this.gameState !== 'racing') return;
            this.renderer.celebrateWinner(0, true);
            this.renderer.exciteCrowd(1);
          }
        });
      })
    );
    this._mpSubs.push(
      this.racingHub.standingsWindowMs$.subscribe(ms => {
        this.ngZone.run(() => {
          this.stopStandingsCountdown();
          if (ms <= 0) {
            this.standingsCountdownText = '';
            return;
          }
          this._standingsDeadline = Date.now() + ms;
          this._standingsTotalMs = ms;
          this._lastStandingsTickSecond = -1;
          this.updateStandingsCountdown();
          this._standingsTimer = window.setInterval(() => this.updateStandingsCountdown(), 500);
        });
      })
    );
    this._mpSubs.push(
      this.racingHub.chatMessage$.subscribe(data => {
        this.ngZone.run(() => {
          this.chatMessages.push(data);
          if (this.chatMessages.length > 50) this.chatMessages.shift();
        });
      })
    );
    this._mpSubs.push(
      this.racingHub.madeHost$.subscribe(() => {
        this.ngZone.run(() => {
          this.isLobbyHost = true;
          const me = this.lobbyPlayers.find(p => p.connectionId === this.racingHub.myConnectionId);
          if (me) me.isHost = true;
          this.addMessage('You are now the host!');
        });
      })
    );
    this._mpSubs.push(
      this.racingHub.hostChanged$.subscribe(data => {
        this.ngZone.run(() => {
          this.lobbyPlayers.forEach(p => p.isHost = p.connectionId === data.connectionId);
          this.isLobbyHost = data.connectionId === this.racingHub.myConnectionId;
        });
      })
    );
    this._mpSubs.push(
      this.racingHub.rematch$.subscribe(players => {
        this.ngZone.run(() => {
          this.lobbyPlayers = players;
          this.amReady = false;
          this.remoteCars.clear();
          this.serverStandings = null;
          this.standingsCountdownText = '';
          this.stopStandingsCountdown();
          this.dnfRacers = [];
          this.messages = [];
          this.stopMpStartCountdown();
          this.stopAutoStartTicker();
          this.autoStartSeconds = 0;
      this.autoStartDeadline = 0;
      this._autoStartTotalMs = 0;
          this.autoStartDeadline = 0;
          this._autoStartTotalMs = 0;
          this.gameState = 'menu';
          this.showMultiplayer = true;
          this.addMessage('Rematch! Ready up to race again.');
        });
      })
    );
    this._mpSubs.push(
      this.racingHub.autoStartCountdown$.subscribe(remaining => {
        this.ngZone.run(() => {
          this.autoStartSeconds = remaining;
          this.autoStartDeadline = Date.now() + remaining * 1000;
          this._autoStartTotalMs = Math.max(remaining * 1000, 100);
          this.startAutoStartTicker();
        });
      })
    );
    this._mpSubs.push(
      this.racingHub.connectionError$.subscribe(err => {
        this.ngZone.run(() => {
          this.lobbyConnectionError = err;
        });
      })
    );
  }
  ngAfterViewInit() {
    this.isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const canvas = this.canvasRef.nativeElement;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    // Mobile / low-core devices get the trimmed scenery tier (fewer conifers,
    // capped snow, smaller mirror) so the mountain & alpine circuits stay smooth.
    const lowQuality = this.isMobile || ((navigator.hardwareConcurrency ?? 8) <= 4);
    this.renderer = new RacingRenderer(canvas, lowQuality);
    this.renderer.profile = this.profile;
    this.isLoaded = true;
    this._onKeyDown = (e: KeyboardEvent) => {
      if (this._destroyed) return;
      this.keys.add(e.code);
      if (e.code === 'KeyW' || e.code === 'ArrowUp') this._gasPressAt = performance.now();
      if (e.code === 'KeyM' && this.gameState === 'racing') this.togglePause();
      if (e.code === 'KeyL') this.toggleLeaderboard();
      if (this.gameState === 'finished') {
        if (e.code === 'Space') {
          e.preventDefault();
          this.replayPaused = !this.replayPaused;
        } else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
          e.preventDefault();
        }
      }
    };
    this._onKeyUp = (e: KeyboardEvent) => {
      if (this._destroyed) return;
      this.keys.delete(e.code);
    };
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    this.ngZone.runOutsideAngular(() => {
      this.lastTime = performance.now();
      this.gameLoop(this.lastTime);
    });
    this._initAudio = () => {
      if (this._destroyed) return;
      if (this.soundOn && !this._audioCtx) this.initEngineAudio();
      document.removeEventListener('click', this._initAudio);
      document.removeEventListener('keydown', this._initAudio);
    };
    document.addEventListener('click', this._initAudio);
    document.addEventListener('keydown', this._initAudio);
    this.setupMobileGestureBlocking();
  }
  /** Mobile: swallow pinch-zoom (gesturestart/change/end), double-tap zoom and
   *  long-press callouts on the whole game. Double-tap / long-press stay enabled
   *  inside text fields so selection, copy and paste still work. Removed in
   *  ngOnDestroy via teardownMobileGestureBlocking. */
  private setupMobileGestureBlocking() {
    if (!this.isMobile) return;
    const root = this.el?.nativeElement as HTMLElement | undefined;
    if (!root) return;
    this._raceRootEl = root;
    this._onGestureStart = (e: Event) => e.preventDefault();
    this._onGestureChange = (e: Event) => e.preventDefault();
    this._onGestureEnd = (e: Event) => e.preventDefault();
    this._onDblClick = (e: Event) => { if (!this.isEditableGestureTarget(e)) e.preventDefault(); };
    this._onContextMenu = (e: Event) => { if (!this.isEditableGestureTarget(e)) e.preventDefault(); };
    root.addEventListener('gesturestart', this._onGestureStart);
    root.addEventListener('gesturechange', this._onGestureChange);
    root.addEventListener('gestureend', this._onGestureEnd);
    root.addEventListener('dblclick', this._onDblClick);
    root.addEventListener('contextmenu', this._onContextMenu);
  }
  private isEditableGestureTarget(e: Event): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable);
  }
  private teardownMobileGestureBlocking() {
    const root = this._raceRootEl;
    if (!root) return;
    root.removeEventListener('gesturestart', this._onGestureStart);
    root.removeEventListener('gesturechange', this._onGestureChange);
    root.removeEventListener('gestureend', this._onGestureEnd);
    root.removeEventListener('dblclick', this._onDblClick);
    root.removeEventListener('contextmenu', this._onContextMenu);
    this._raceRootEl = null;
  }
  ngOnDestroy() {
    this._destroyed = true;
    cancelAnimationFrame(this.animId);
    if (this._countdownInterval) clearInterval(this._countdownInterval);
    this.stopMpStartCountdown();
    this.stopAutoStartTicker();
    this.stopStandingsCountdown();
    this.stopReplayUiTimer();
    if (this.msgTimer) clearTimeout(this.msgTimer);
    if (this._recordToastTimer) clearTimeout(this._recordToastTimer);
    if (this._beatFriendToastTimer) clearTimeout(this._beatFriendToastTimer);
    if (this._glowIntensitySaveTimer) clearTimeout(this._glowIntensitySaveTimer);
    if (this._mpLobbyTrackId) {
      this.racingHub.leaveLobby(this._mpLobbyTrackId);
    }
    this.racingHub.disconnect();
    this._mpSubs.forEach(s => s.unsubscribe());
    this.stopEngineAudio();
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('click', this._initAudio);
    document.removeEventListener('keydown', this._initAudio);
    this.teardownMobileGestureBlocking();
    this.renderer?.dispose();
    this.renderer = null!;
    this.remove_me("RacingComponent");
  }
  private async loadPlayerCar() {
    const userId = this.parentRef?.user?.id ?? 0;
    if (!userId) return;
    const car = await this.racingService.getPlayerCar(userId);
    if (car) {
      this.playerCar = car;
      if (!this.playerCar.playerName) {
        this.playerCar.playerName = this.parentRef?.user?.username || '';
      }
    }
    else {
      this.playerCar.userId = userId;
      this.playerCar.playerName = this.parentRef?.user?.username || '';
      this.playerCar.money = 500;
      this.playerCar.upgrades = [];
      this.playerCar.skinId = 1;
    }
    this.invalidateUpgradeStats();
    this.playerNameDraft = this.playerCar.playerName || '';
    this.loadLeaderboard();
  }
  private async refreshPlayerCarFromServer() {
    const userId = this.parentRef?.user?.id ?? 0;
    if (!userId) return;
    const car = await this.racingService.getPlayerCar(userId);
    if (car) {
      this.playerCar = car;
      if (!this.playerCar.playerName) {
        this.playerCar.playerName = this.parentRef?.user?.username || '';
      }
      this.invalidateUpgradeStats();
    }
  }
  // Upgrade-derived stats are computed once and cached (invalidated whenever
  // playerCar changes). The physics step, bot AI and HUD read them many times
  // per frame, and each getter used to rescan the upgrades array on every call
  // — a small but constant per-frame tax exactly when cornering matters.
  private _upgradeStatsDirty = true;
  private _upgradeStats: {
    speedBonus: number; gripBonus: number; cornerBonus: number; downforceBonus: number;
    dragPenalty: number; brakeBonus: number; weightBonus: number;
  } | null = null;
  private invalidateUpgradeStats() { this._upgradeStatsDirty = true; }
  private upgradeStats() {
    if (!this._upgradeStatsDirty && this._upgradeStats) return this._upgradeStats;
    let speedBonus = 0, gripBonus = 0, cornerBonus = 0, brakeBonus = 0, weightBonus = 0;
    for (const u of this.playerCar.upgrades) {
      if (u.category === 'engine') speedBonus += u.statBonus;
      else if (u.category === 'tires') gripBonus += u.statBonus;
      else if (u.category === 'suspension') cornerBonus += u.statBonus;
      else if (u.category === 'brakes') brakeBonus += u.statBonus;
      else if (u.category === 'body') weightBonus += u.statBonus;
    }
    const spoilerId = this.playerCar.spoilerId;
    this._upgradeStats = {
      speedBonus, gripBonus, cornerBonus,
      downforceBonus: spoilerId ? (SPOILER_DOWNFORCE[spoilerId] ?? 0) : 0,
      dragPenalty: spoilerId ? (SPOILER_DRAG[spoilerId] ?? 0) : 0,
      brakeBonus, weightBonus,
    };
    this._upgradeStatsDirty = false;
    return this._upgradeStats;
  }
  getSpeedBonus(): number { return this.upgradeStats().speedBonus; }
  getGripBonus(): number { return this.upgradeStats().gripBonus; }
  getCornerBonus(): number { return this.upgradeStats().cornerBonus; }
  /** Downforce bonus (%) from the equipped spoiler — taller/multi-element wings
   *  press harder. Feeds the cornering factor alongside suspension, so aero
   *  upgrades visibly improve handling. 0 when no spoiler is equipped. */
  getDownforceBonus(): number { return this.upgradeStats().downforceBonus; }
  /** Top-speed drag penalty (%) from the equipped spoiler — the cost of big
   *  aero. 0 when no spoiler is equipped. */
  getDragPenalty(): number { return this.upgradeStats().dragPenalty; }
  /** Multiplier applied to top speed (1 - drag/100). */
  private getDragFactor(): number {
    return 1 - this.getDragPenalty() / 100;
  }
  /** Spoiler card stat: current equipped downforce -> this part's downforce,
   *  plus this wing's drag penalty (0 = none). */
  getSpoilerStatPreview(p: RacingAppearancePart): { before: number; after: number; drag: number } | null {
    if (p.category !== 'spoiler') return null;
    const current = this.getEquippedAppearance('spoiler');
    return {
      before: current ? (SPOILER_DOWNFORCE[current] ?? 0) : 0,
      after: SPOILER_DOWNFORCE[p.id] ?? 0,
      drag: SPOILER_DRAG[p.id] ?? 0,
    };
  }
  getBrakeBonus(): number { return this.upgradeStats().brakeBonus; }
  getWeightBonus(): number { return this.upgradeStats().weightBonus; }
  getMaxSpeed(): number {
    // Drag from big aero (whale tail / bi-plane) caps top speed — the tradeoff
    // for their cornering gain, visible in the HUD and on the upgrade cards.
    return MAX_SPEED_BASE * (1 + this.getSpeedBonus() / 100) * (1 - this.getWeightBonus() / 200) * this.getDragFactor();
  }
  getSkinColor(): string {
    const skin = CAR_SKINS.find(s => s.id === this.playerCar.skinId) || CAR_SKINS[0];
    return skin.color;
  }
  getCarLabel(): string {
    const skin = CAR_SKINS.find(s => s.id === this.playerCar.skinId);
    return skin?.name || 'CUSTOM';
  }
  selectTrack(track: TrackDefinition) {
    if (this.playerCar.money < track.entryFee) {
      this.addMessage(`You need $${track.entryFee.toLocaleString()} to enter ${track.name}.`);
      return;
    }
    this.selectedTrack = track;
    this.gameState = 'countdown';
    this.startRace(track);
  }
  selectTrackMultiplayer(track: TrackDefinition) {
    if (this.playerCar.money < track.entryFee) {
      this.addMessage(`You need $${track.entryFee.toLocaleString()} to enter ${track.name}.`);
      return;
    }
    this.selectedTrack = track;
    this.showMultiplayer = true;
    this.joinLobby(track);
  }
  async toggleMultiplayerTab() {
    this.showMultiplayer = !this.showMultiplayer;
    if (this.showMultiplayer) {
      await this.ensureHubConnection();
      if (!this._mpLobbyTrackId) {
        this.selectedTrack = null;
        this.lobbyConnectionError = '';
      }
    }
    if (!this.showMultiplayer) {
      if (this._mpLobbyTrackId) {
        this.racingHub.leaveLobby(this._mpLobbyTrackId);
        this._mpLobbyTrackId = '';
        this.lobbyPlayers = [];
        this.isLobbyHost = false;
        this.amReady = false;
        this.chatMessages = [];
        this.stopMpStartCountdown();
        this.stopAutoStartTicker();
        this.autoStartSeconds = 0;
        this.autoStartDeadline = 0;
        this._autoStartTotalMs = 0;
      }
      this.selectedTrack = null;
      this.lobbyConnectionError = '';
    }
  }
  private async ensureHubConnection(): Promise<void> {
    if (this.racingHub.connected || this.mpConnecting) return;
    this.mpConnecting = true;
    try {
      await this.racingHub.connect();
    } finally {
      this.mpConnecting = false;
    }
  }
  private async joinLobby(track: TrackDefinition) {
    const username = this.playerCar.playerName?.trim() || this.parentRef?.user?.username || 'Player';
    const userId = this.parentRef?.user?.id ?? 0;
    const tid = track.id.toString();
    this.trackIdStr = tid;
    this._mpLobbyTrackId = tid;
    const upgradeLevel = this.playerCar.upgrades.reduce((sum, u) => sum + (u.level || 0), 0);
    const state = await this.racingHub.joinLobby(tid, username, userId, track.laps, this.renderer?.totalTrackDist || 0, upgradeLevel);
    if (state) {
      this.lobbyPlayers = state.players;
      this.isLobbyHost = state.isHost;
      if (state.autoStartRemaining && state.autoStartRemaining > 0) {
        this.autoStartSeconds = state.autoStartRemaining;
        this.autoStartDeadline = Date.now() + state.autoStartRemaining * 1000;
        this._autoStartTotalMs = Math.max(state.autoStartRemaining * 1000, 100);
        this.startAutoStartTicker();
      }
      this.lobbyConnectionError = '';
      this.addMessage(`Joined multiplayer lobby for ${track.name}`);
    } else {
      this.lobbyConnectionError = 'Failed to join lobby. Try again.';
    }
  }
  async retryJoinLobby() {
    if (this.selectedTrack) {
      await this.joinLobby(this.selectedTrack);
    }
  }
  async toggleReadyMultiplayer() {
    if (!this._mpLobbyTrackId) return;
    this.amReady = !this.amReady;
    await this.racingHub.toggleReady(this._mpLobbyTrackId);
  }
  get autoStartDisplay(): string {
    if (this.autoStartSeconds <= 0) return '';
    const m = Math.floor(this.autoStartSeconds / 60);
    const s = this.autoStartSeconds % 60;
    return `Auto-start in ${m}:${s.toString().padStart(2, '0')}`;
  }
  get garageCountdownProgress(): number {
    if (this.autoStartDeadline <= 0) return 0;
    if (this.countdownTimer > 0) {
      return Math.max(0, Math.min(100, (this.countdownTimer / 10) * 100));
    }
    if (this.autoStartSeconds <= 0 || this._autoStartTotalMs <= 0) return 0;
    const remain = Math.max(0, this.autoStartDeadline - Date.now());
    return Math.max(0, Math.min(100, (remain / this._autoStartTotalMs) * 100));
  }
  get garageCountdownLow(): boolean {
    if (this.countdownTimer > 0) return this.countdownTimer <= 3;
    return this.autoStartSeconds > 0 && this.autoStartSeconds <= 3;
  }
  get countdownProgress(): number {
    return Math.max(0, Math.min(100, (this.countdownTimer / 10) * 100));
  }
  get startLightPhase(): 'red' | 'yellow' | 'green' | 'go' {
    if (this.countdownTimer >= 8) return 'red';
    if (this.countdownTimer >= 1) return 'yellow';
    return 'go';
  }
  get garageCountdownDisplay(): string {
    if (!this.showMultiplayer && !this._mpLobbyTrackId) return '';
    if (this.countdownTimer > 0) return `⏱ ${this.countdownTimer}s to start`;
    if (this.autoStartSeconds > 0) {
      const m = Math.floor(this.autoStartSeconds / 60);
      const s = this.autoStartSeconds % 60;
      return `⏱ auto-start ${m}:${s.toString().padStart(2, '0')}`;
    }
    return '';
  }
  async startRaceMP() {
    if (!this._mpLobbyTrackId || !this.isLobbyHost) return;
    this.countdownTimer = 10;
    this.gameState = 'countdown';
    await this.racingHub.startRace(this._mpLobbyTrackId, this.selectedTrack?.laps ?? 3, this.renderer?.totalTrackDist || 0);
  }
  private stopMpStartCountdown() {
    if (this._mpStartCountdownTimer) {
      clearInterval(this._mpStartCountdownTimer);
      this._mpStartCountdownTimer = null;
    }
  }
  private startAutoStartTicker() {
    if (this._autoStartTicker) clearInterval(this._autoStartTicker);
    this._lastTickSecond = -1;
    if (this.autoStartDeadline > 0 && this._autoStartTotalMs <= 0) {
      this._autoStartTotalMs = Math.max(this.autoStartSeconds * 1000, 100);
    }
    this._autoStartTicker = setInterval(() => {
      const remain = Math.max(0, Math.ceil((this.autoStartDeadline - Date.now()) / 1000));
      this.autoStartSeconds = remain;
      if (this.gameState === 'garage' && remain !== this._lastTickSecond) {
        this._lastTickSecond = remain;
        if (remain > 0) this.playCountdownTick(remain);
      }
      if (remain <= 0 && this._autoStartTicker) {
        clearInterval(this._autoStartTicker);
        this._autoStartTicker = null;
        if (this.gameState === 'garage' && this._mpLobbyTrackId) {
          this.closeGarageForRaceStart();
        }
      }
    }, 500);
  }
  private playMarmotWhistle() {
    if (this._destroyed || !this.soundOn || !this._audioCtx) return;
    try {
      const ctx = this._audioCtx;
      const t = ctx.currentTime;
      for (let chirp = 0; chirp < 2; chirp++) {
        const start = t + chirp * 0.13;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2600, start);
        osc.frequency.linearRampToValueAtTime(3400, start + 0.05);
        osc.frequency.linearRampToValueAtTime(2100, start + 0.11);
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(0.035, start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.13);
      }
    } catch { }
  }
  private playCountdownTick(secondsLeft: number) {
    if (this._destroyed || !this.soundOn || !this._audioCtx) return;
    try {
      const ctx = this._audioCtx;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = secondsLeft <= 3 ? 880 : 660;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.045, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.18);
    } catch { }
  }
  private playGoChime() {
    if (this._destroyed || !this.soundOn || !this._audioCtx) return;
    try {
      const ctx = this._audioCtx;
      const t = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99]; 
      notes.forEach((f, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = f;
        const g = ctx.createGain();
        const start = t + i * 0.09;
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(0.09, start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.55);
      });
    } catch { }
  }
  /** Closes the garage cleanly when a multiplayer race is starting, so the
   *  start lights are never hidden behind the upgrade screen. No-op outside
   *  the garage; the caller still transitions to the countdown state. */
  private closeGarageForRaceStart() {
    this.showOptions = false;
    if (this.gameState !== 'garage') return;
    this.selectedTab = 'menu';
    this.gameState = 'countdown';
  }
  private stopAutoStartTicker() {
    if (this._autoStartTicker) {
      clearInterval(this._autoStartTicker);
      this._autoStartTicker = null;
    }
  }
  /** Judge the launch at lights-out: boost when the throttle was freshly
   *  engaged (≤1.4s ago — the GO flash is the cue) with a revved engine.
   *  Must run BEFORE the countdown rev is reset. */
  private evaluatePerfectLaunch() {
    const rev = this._countdownRev;
    const pressAge = performance.now() - this._gasPressAt;
    const gasNow = this.gasHeld || this.keys.has('KeyW') || this.keys.has('ArrowUp');
    if (!gasNow || rev < 0.35 || pressAge > 1400) return;

    // Nailed it — a revved, freshly-timed launch at the lights.
    this._launchBoostTimer = 1.4;
    this.perfectLaunchFlash = 1;
    this.addMessage('🏁 PERFECT START! Launch boost!');
    if (this._launchFlashTimer) clearTimeout(this._launchFlashTimer);
    this._launchFlashTimer = setTimeout(() => { this.perfectLaunchFlash = 0; }, 1700);
  }

  private beginRace() {
    this.playGoChime();
    // Reset any stale launch state, then judge this race's launch while the
    // countdown rev is still live (it's zeroed further down).
    this._launchBoostTimer = 0;
    this.perfectLaunchFlash = 0;
    this.evaluatePerfectLaunch();
    this.gameState = 'racing';
    this.raceStartTime = performance.now();
    this.lapStartTime = this.raceStartTime;
    this.currentLap = 0;
    this._brakePeakThisLap = 0;
    this.bestLapTime = Infinity;
    this.carSpeed = 0;
    this.carDist = 0;
    this.lastCarDist = 0;
    this._playerRaceDist = 0;
    this.racePosition = 1;
    this.lapTimes = [];
    this.lastLapTime = 0;
    this.totalRaceTime = 0;
    this.isOffTrack = false;
    this.offTrackTimer = 0;
    this.wrongWay = false;
    this._wrongWayTimer = 0;
    this._wrongWayShown = false;
    this._wrongWaySliding = false;
    this.messages = [];
    this.finalStandings = [];
    this.serverStandings = null;
    this.standingsCountdownText = '';
    this.stopStandingsCountdown();
    this.dnfRacers = [];
    this._raceFinished = false;
    this._replayFrames.clear();
    this._replayTime = 0;
    this._replaySpins.clear();
    this._replayAppearances.clear();
    this.replayPaused = false;
    this.replayScrubDir = 0;
    this._replayDragging = false;
    this.replayCam = 0;
    this.replayLeadName = '';
    this.replayFollowId = null;
    this.replayFollowName = '';
    this._countdownRev = 0;
    this._mpFinished = false;
    this._mpWinnerCelebrated = false;
    // Server-authoritative grid: place the player by their slot (least upgraded
    // on pole, most upgraded at the back), then pre-place the other lobby cars
    // on their grid spots so the field is visibly lined up from the flag drop
    // instead of everyone stacked on the start line. setTheme regenerates the
    // circuit geometry, so the grid must be placed against the fresh start line.
    if (this.selectedTrack) {
      this.renderer.setTheme(this.themeForTrack(this.selectedTrack.id));
    }
    this.placePlayerOnGrid();
    this.spawnBots(4);
    this.totalRacers = this.bots.length + this.lobbyPlayers.length;
    this.preplaceRemotesOnGrid();
    if (this.selectedTrack) {
      this.playerCar.money -= this.selectedTrack.entryFee;
      this.saveCar();
    }
    this.playCrowdCheer('big', 1.1);
    this.addMessage('GO! GO! GO!');
  }
  async rematchMP() {
    if (!this._mpLobbyTrackId || !this.isLobbyHost) return;
    await this.racingHub.rematch(this._mpLobbyTrackId);
  }
  async leaveLobby() {
    if (!this._mpLobbyTrackId) return;
    await this.racingHub.leaveLobby(this._mpLobbyTrackId);
    this.stopMpStartCountdown();
    this.stopAutoStartTicker();
    this.autoStartSeconds = 0;
    this.autoStartDeadline = 0;
    this._autoStartTotalMs = 0;
    this._mpLobbyTrackId = '';
    this.lobbyPlayers = [];
    this.isLobbyHost = false;
    this.amReady = false;
    this.chatMessages = [];
    this.remoteCars.clear();
    this.selectedTrack = null;
    this.lobbyConnectionError = '';
    this.showMultiplayer = true;
  }
  async kickPlayer(connectionId: string) {
    if (!this.isLobbyHost) return;
    this.addMessage('Host can ask players to leave via chat.');
  }
  async sendChatMessage() {
    if (!this.chatInput.trim() || !this._mpLobbyTrackId) return;
    const message = this.chatInput;
    this.chatInput = '';
    await this.racingHub.sendChat(this._mpLobbyTrackId, message);
  }
  get inMpLobby(): boolean { return !!this._mpLobbyTrackId; }
  openGarage() {
    this.selectedTab = 'upgrades';
    this.gameState = 'garage';
    this.restoreGarageCam();
  }
  backToMenu() {
    this.gameState = 'menu';
    this.selectedTab = 'menu';
    if (this._mpLobbyTrackId && this.showMultiplayer) {
      return;
    }
    if (this._mpLobbyTrackId) {
      this.racingHub.leaveLobby(this._mpLobbyTrackId);
      this._mpLobbyTrackId = '';
      this.lobbyPlayers = [];
      this.isLobbyHost = false;
      this.amReady = false;
      this.chatMessages = [];
      this.remoteCars.clear();
      this.stopMpStartCountdown();
      this.stopAutoStartTicker();
      this.autoStartSeconds = 0;
      this.autoStartDeadline = 0;
      this._autoStartTotalMs = 0;
    }
    this.selectedTrack = null;
    this.lobbyConnectionError = '';
    this.showMultiplayer = false;
  }
  carRotateX = 20;
  carRotateY = -40;
  carZoom = 1;
  isCarDragging = false;
  private _carDragStart: { x: number; y: number; rotX: number; rotY: number } | null = null;
  onCarPointerDown(e: PointerEvent) {
    this._carDragStart = { x: e.clientX, y: e.clientY, rotX: this.carRotateX, rotY: this.carRotateY };
    this.isCarDragging = true;
    try { (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId); } catch { }
    e.preventDefault();
  }
  onCarPointerMove(e: PointerEvent) {
    if (!this._carDragStart) return;
    const dx = e.clientX - this._carDragStart.x;
    const dy = e.clientY - this._carDragStart.y;
    this.carRotateY = this._carDragStart.rotY + dx * 0.45;
    this.carRotateX = Math.max(-70, Math.min(70, this._carDragStart.rotX - dy * 0.45));
    this.saveGarageCam();
  }
  onCarPointerUp() {
    this._carDragStart = null;
    this.isCarDragging = false;
  }
  zoomCar(dir: number) {
    this.carZoom = Math.max(0.55, Math.min(2.2, Math.round((this.carZoom + dir) * 100) / 100));
    this.saveGarageCam();
  }
  onCarWheel(e: WheelEvent) {
    e.preventDefault();
    this.zoomCar(e.deltaY < 0 ? 0.15 : -0.15);
  }
  resetCarView() {
    this.carRotateX = 20;
    this.carRotateY = -40;
    this.carZoom = 1;
    this.saveGarageCam();
  }
  private garageCamStorageKey(): string {
    return 'gp_garage_cam_' + (this.parentRef?.user?.id ?? 0);
  }
  private saveGarageCam() {
    try {
      localStorage.setItem(this.garageCamStorageKey(), JSON.stringify({
        rotX: this.carRotateX,
        rotY: this.carRotateY,
        zoom: this.carZoom,
      }));
    } catch { }
  }
  private restoreGarageCam() {
    try {
      const raw = localStorage.getItem(this.garageCamStorageKey());
      if (!raw) return;
      const cam = JSON.parse(raw);
      if (typeof cam === 'object' && cam !== null) {
        if (typeof cam.rotX === 'number' && isFinite(cam.rotX)) this.carRotateX = Math.max(-70, Math.min(70, cam.rotX));
        if (typeof cam.rotY === 'number' && isFinite(cam.rotY)) this.carRotateY = cam.rotY;
        if (typeof cam.zoom === 'number' && isFinite(cam.zoom)) this.carZoom = Math.max(0.55, Math.min(2.2, cam.zoom));
      }
    } catch { }
  }
  getPlayerColor(connectionId: string): string {
    const colors = ['#e53935', '#4a9eff', '#4caf50', '#ffd600', '#9c27b0', '#ff9800', '#00bcd4', '#e91e63'];
    const idx = this.lobbyPlayers.findIndex(p => p.connectionId === connectionId);
    return colors[Math.abs(idx) % colors.length];
  }
  private getBotColorRGB(color: number): [number, number, number] {
    return BOT_PAINT[color % BOT_PAINT.length];
  }
  /** F1-style grid slot -> track offset + lateral lane. Slots fill in pairs:
   *  row = floor(slot/2), lanes alternate right/left per row, and rows are
   *  7.5m apart so the field looks like a real starting grid, not a line. */
  private gridPlaceForSlot(slot: number): { offset: number; lane: number } {
    const row = Math.floor(slot / 2);
    const lane = slot % 2 === 0 ? 1.2 : -1.2;
    return { offset: -row * 7.5, lane };
  }

  /** World x/z/yaw for a grid slot on the current track (car-local lane offset
   *  applied perpendicular to the racing line, like spawnBots does). Falls back
   *  to the start line itself if the circuit isn't measured yet. */
  private gridSlotPosition(slot: number): { x: number; z: number; yaw: number } {
    const gp = this.gridPlaceForSlot(slot);
    const tt = this.renderer.totalTrackDist;
    if (tt <= 0) {
      const bp = this.renderer.getTrackPointAlong(0);
      return { x: bp.x, z: bp.z, yaw: Math.atan2(bp.dirX, bp.dirZ) };
    }
    const d = ((gp.offset % tt) + tt) % tt;
    const bp = this.renderer.getTrackPointAlong(d);
    return {
      x: bp.x + -bp.dirZ * gp.lane,
      z: bp.z + bp.dirX * gp.lane,
      yaw: Math.atan2(bp.dirX, bp.dirZ),
    };
  }

  /** Place the player's car on their grid slot (server order for MP, pole in
   *  solo) so the field is lined up from the lights, not stacked on the line. */
  private placePlayerOnGrid() {
    const myId = this.parentRef?.user?.id ?? 0;
    const myConn = this.racingHub.myConnectionId || '';
    const mySlot = this._mpGrid.find(g => g.playerId === myId || g.connectionId === myConn)?.slot ?? 0;
    const g0 = this.gridSlotPosition(mySlot);
    this.carX = g0.x;
    this.carZ = g0.z;
    this.carYaw = g0.yaw;
    this.carDir = this.carYaw;
    this.slipAngle = 0;
  }

  /** Pre-place the other lobby cars on their grid slots so everyone is visible
   *  from the flag drop, before their 10Hz position syncs start arriving. */
  private preplaceRemotesOnGrid() {
    const myId = this.parentRef?.user?.id ?? 0;
    const myConn = this.racingHub.myConnectionId || '';
    for (const g of this._mpGrid) {
      if (g.playerId === myId || g.connectionId === myConn) continue;
      if (this.remoteCars.has(g.connectionId)) continue;
      const pos = this.gridSlotPosition(g.slot);
      this.remoteCars.set(g.connectionId, {
        connectionId: g.connectionId,
        playerName: g.playerName,
        playerId: g.playerId,
        x: pos.x, z: pos.z, yaw: pos.yaw,
        speed: 0, distance: 0, currentLap: 0, isOffTrack: false,
        colorR: 0.9, colorG: 0.3, colorB: 0.3,
        lap: 0, slide: 0,
        raceDist: this.gridPlaceForSlot(g.slot).offset,
      });
      this.totalRacers = this.bots.length + this.lobbyPlayers.length;
    }
  }

  private spawnBots(count: number) {
    this.bots = [];
    const botNames = ['Speed Racer', 'Lightning', 'Nitro', 'Tornado', 'Blitz', 'Storm', 'Vortex', 'Phantom'];
    const diffPool: string[] = [];
    for (let i = 0; i < count; i++) {
      if (i < 2) diffPool.push('hard');
      else if (i < 4) diffPool.push('medium');
      else diffPool.push('easy');
    }
    for (let i = diffPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [diffPool[i], diffPool[j]] = [diffPool[j], diffPool[i]];
    }
    for (let i = 0; i < count; i++) {
      // Bots fill the grid behind the player (slot 0): pairs side by side,
      // staggered rows, instead of the old single-file line.
      const gp = this.gridPlaceForSlot(i + 1);
      const laneOffset = gp.lane;
      const bp = this.renderer.getTrackPointAlong(((gp.offset % this.renderer.totalTrackDist) + this.renderer.totalTrackDist) % this.renderer.totalTrackDist);
      const ppx = -bp.dirZ;
      const ppz = bp.dirX;
      const config = BOT_CONFIGS[diffPool[i]];
      this.bots.push({
        id: 'b' + i,
        dist: ((gp.offset % this.renderer.totalTrackDist) + this.renderer.totalTrackDist) % this.renderer.totalTrackDist,
        speed: 0,
        yaw: Math.atan2(bp.dirX, bp.dirZ),
        x: bp.x + ppx * laneOffset, z: bp.z + ppz * laneOffset,
        lap: 0,
        name: botNames[i % botNames.length],
        color: i % 8,
        config,
        mistakeTimer: 0,
        hasMistake: false,
        alive: true,
        laneOffset,
        raceDist: gp.offset,
        pace: 0.88 + Math.random() * 0.24,
        slide: 0,
        rimBumpTimer: 0,
        crashTimer: 0,
        crashSpinDir: 1,
        crashDuration: 0,
        hitSlowTimer: 0,
        pid: -(i % 8) - 1,
        lapStart: 0,
        bestLap: 0,
      });
    }
  }
  private startRace(track: TrackDefinition) {
    const userId = this.parentRef?.user?.id ?? 0;
    if (!userId || !this.selectedTrack) return;
    this.showOptions = false;
    this.totalLaps = track.laps;
    this.currentLap = 0;
    this.countdownTimer = 10;
    this.racePosition = 1;
    this.carSpeed = 0;
    this.carDist = 0;
    this.lastCarDist = 0;
    this._playerRaceDist = 0;
    this.lapTimes = [];
    this.lastLapTime = 0;
    this.raceStartTime = performance.now();
    this.lapStartTime = performance.now();
    this.totalRaceTime = 0;
    this.bestLapTime = Infinity;
    this.isOffTrack = false;
    this.offTrackTimer = 0;
    this.wrongWay = false;
    this._wrongWayTimer = 0;
    this._wrongWayShown = false;
    this._wrongWaySliding = false;
    this.messages = [];
    this.finalStandings = [];
    this.serverStandings = null;
    this.standingsCountdownText = '';
    this.stopStandingsCountdown();
    this.dnfRacers = [];
    this._raceFinished = false;
    this._replayFrames.clear();
    this._replayTime = 0;
    this._replaySpins.clear();
    this._replayAppearances.clear();
    this.replayPaused = false;
    this.replayScrubDir = 0;
    this._replayDragging = false;
    this.replayCam = 0;
    this.replayLeadName = '';
    this.replayFollowId = null;
    this.replayFollowName = '';
    this._countdownRev = 0;
    this._mpFinished = false;
    this._mpWinnerCelebrated = false;
    // F1-style grid: the player takes pole (slot 0), bots fill the pairs
    // behind them via spawnBots. Distance tracking starts at 0 on the line.
    // setTheme regenerates the circuit geometry, so the grid is placed after
    // it so cars line up on the freshly built start line.
    this.renderer.setTheme(this.themeForTrack(track.id));
    this.placePlayerOnGrid();
    this._countdownPanStartAt = performance.now();
    this.carDist = 0;
    this.spawnBots(4);
    this.totalRacers = 1 + this.bots.length;
    this._countdownInterval = setInterval(() => {
      this.countdownTimer--;
      if (this.countdownTimer < 0) {
        clearInterval(this._countdownInterval);
        this.ngZone.run(() => {
          // Judge the launch before the state flips (the countdown rev is still
          // live here) — a timed, revved tap at the lights pays off.
          this._launchBoostTimer = 0;
          this.perfectLaunchFlash = 0;
          this.evaluatePerfectLaunch();
          this.gameState = 'racing';
          this.raceStartTime = performance.now();
          this.lapStartTime = this.raceStartTime;
          // Bots start timing their laps from the lights-out moment too, so the
          // submitted grid's best laps are comparable to the player's.
          for (const b of this.bots) b.lapStart = this.raceStartTime;
          this.playCrowdCheer('big', 1.2);
        });
      }
    }, 1000);
    this.playerCar.money -= track.entryFee;
    this.saveCar();
  }
  togglePause() {
    this.gameState = this.gameState === 'racing' ? 'paused' : 'racing';
  }

  /** Cinematic camera for the start countdown. Orbits the starting grid so the
   *  field stays visible while the lights count down, and after GO blends the
   *  last pan position back into the cockpit camera over ~0.6s so the handoff
   *  is smooth. Returns null once the race is fully underway (cockpit view). */
  private countdownPanCamera(eyeX: number, eyeY: number, eyeZ: number, yaw: number, pitch: number):
    { eyeX: number; eyeY: number; eyeZ: number; yaw: number; pitch: number } | null {
    if (this.gameState === 'countdown') {
      const elapsed = performance.now() - this._countdownPanStartAt;
      const panT = Math.max(0, Math.min(1, 1 - elapsed / RacingComponent.COUNTDOWN_PAN_MS));
      this._lastPanCam = this.buildCountdownPanCamera(panT);
      return this._lastPanCam;
    }
    if (this.gameState === 'racing' && this._lastPanCam) {
      const blend = Math.max(0, Math.min(1, (performance.now() - this.raceStartTime) / 600));
      if (blend < 1) {
        const t = blend * blend * (3 - 2 * blend);
        const pan = this._lastPanCam;
        return {
          eyeX: eyeX + (pan.eyeX - eyeX) * (1 - t),
          eyeY: eyeY + (pan.eyeY - eyeY) * (1 - t),
          eyeZ: eyeZ + (pan.eyeZ - eyeZ) * (1 - t),
          yaw: this.lerpAngle(yaw, pan.yaw, 1 - t),
          pitch: pitch + (pan.pitch - pitch) * (1 - t),
        };
      }
    }
    this._lastPanCam = null;
    return null;
  }

  /** Orbit camera around the grid center. `panT` runs 1 (lights appear) to 0
   *  (GO): a full sweep that ends back behind the pack, with the radius and
   *  height eased in/out so the countdown starts near the cockpit view and GO
   *  hands off to it with barely any jump. Kept under the start gantry beam
   *  (4.4m) so the camera never clips through it. */
  private buildCountdownPanCamera(panT: number): { eyeX: number; eyeY: number; eyeZ: number; yaw: number; pitch: number } {
    let gx = this.carX, gz = this.carZ, n = 1;
    for (const b of this.bots) { gx += b.x; gz += b.z; n++; }
    this.remoteCars.forEach(rc => { gx += rc.x; gz += rc.z; n++; });
    gx /= n; gz /= n;
    const gElev = this.renderer.getTrackElevation(this.renderer.getDistFromPoint(gx, gz));
    const lookY = gElev + 0.6;
    const ease = Math.sin(panT * Math.PI);
    const angle = this.carYaw - Math.PI * 2 * (1 - panT);
    const radius = 13 * (0.35 + 0.65 * ease);
    const height = 2.8 + 1.0 * ease;
    const eyeX = gx + Math.sin(angle) * radius;
    const eyeZ = gz + Math.cos(angle) * radius;
    const eyeY = this.renderer.getTrackElevation(this.renderer.getDistFromPoint(eyeX, eyeZ)) + height;
    const dx = gx - eyeX, dz = gz - eyeZ;
    const dist = Math.hypot(dx, dz) || 1;
    return {
      eyeX, eyeY, eyeZ,
      yaw: Math.atan2(dx, dz),
      pitch: Math.atan2(eyeY - lookY, dist),
    };
  }

  private pMark(key: string) {
    if (!this.profile) return;
    const n = performance.now();
    const d = n - this._pLast;
    this._pLast = n;
    if (d >= 0) this._profTimes[key] = (this._profTimes[key] || 0) + d;
  }
  private profileSample() {
    const r = this.renderer;
    const combined: { [key: string]: number } = {};
    if (r) { for (const k in r.profileTimes) combined[k] = (combined[k] || 0) + r.profileTimes[k]; }
    for (const k in this._profTimes) combined[k] = (combined[k] || 0) + this._profTimes[k];
    const frames = Math.max(1, this._profFrames);
    const keys = Object.keys(combined).sort((a, b) => (combined[b] || 0) - (combined[a] || 0));
    const parts = keys.map(k => `${k}=${((combined[k] || 0) / frames).toFixed(3)}ms`);
    const total = (combined['frame'] || 0) / frames;
    console.log(`[racing-profile] ${frames} frames, total ${total.toFixed(2)}ms/frame — ${parts.join(', ')}`);
    if (r) r.profileReset();
    this._profTimes = {};
    this._profFrames = 0;
  }
  private gameLoop(time: number) {
    if (this._destroyed) return;
    this.animId = requestAnimationFrame((t) => this.gameLoop(t));
    const dt = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;
    if (this.profile) this._pLast = performance.now();
    if (this.gameState === 'racing') {
      this.processInput(dt);
    } else if (this.gameState === 'countdown') {
      // Let players rev their engines on the grid while the lights count down:
      // throttle ramps the rev (audio + RPM + exhaust glow) but the car stays
      // parked — updatePhysics only runs once the race starts.
      this.processInput(dt);
      if (this.carAccel > 0) {
        this._countdownRev = Math.min(1, this._countdownRev + dt * 1.6);
      } else {
        this._countdownRev = Math.max(0, this._countdownRev - dt * 2.2);
      }
    }
    if (this.gameState === 'finished' && this._raceFinished && this.racePosition === 1) {
      const grip = 0.85 + this.getGripBonus() / 100;
      this.carSpeed -= 26 * grip * dt;
      if (this.carSpeed <= 0) this.carSpeed = 0;
      this.carX += Math.sin(this.carYaw) * this.carSpeed * dt;
      this.carZ += Math.cos(this.carYaw) * this.carSpeed * dt;
      const cd = this.renderer.getDistFromPoint(this.carX, this.carZ);
      const tp = this.renderer.getTrackPointAlong(cd);
      const expected = Math.atan2(tp.dirX, tp.dirZ);
      let dh = this.carYaw - expected;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      this.carYaw += Math.max(-0.9 * dt, Math.min(0.9 * dt, dh * 1.2));
    }
    if (this.profile) this.pMark('input');
    if (this.gameState === 'racing') {
      this.updatePhysics(dt);
      if (this.profile) this.pMark('physics');
      this.updateBots(dt);
      if (this.profile) this.pMark('bots');
      this.checkLapCrossing();
      this.updateRacePosition();
      this.totalRaceTime += dt * 1000;
      // Ring buffer caps itself — no shift() tax once 6000 frames are in.
      const recColors = [
        [0.8, 0.2, 0.2], [0.2, 0.4, 0.9], [0.1, 0.7, 0.1],
        [0.9, 0.7, 0.1], [0.7, 0.2, 0.7], [1.0, 0.5, 0]
      ];
      const rcars: ReplayCar[] = [];
      this.bots.forEach((b, bi) => {
        const pc = recColors[b.color % recColors.length];
        const prev = this._prevBotSpeeds.get(b) ?? b.speed;
        // Record the exact livery the bot wore live (same formula as the live render
        // loop: botAppearanceFor(index, color)) so the replay matches the race.
        const appId = 'b' + bi;
        if (!this._replayAppearances.has(appId)) {
          this._replayAppearances.set(appId, this.botAppearanceFor(bi, b.color));
        }
        rcars.push({
          x: b.x, z: b.z, yaw: b.yaw, speed: b.speed,
          accel: dt > 0 ? (b.speed - prev) / dt : 0, slide: b.slide,
          id: appId, r: pc[0], g: pc[1], b: pc[2],
          dist: b.raceDist, name: b.name
        });
      });
      this.remoteCars.forEach((rc) => {
        const prev = this._prevRemoteSpeeds.get(rc.connectionId) ?? rc.speed;
        // Remote cars: persist the same seeded appearance the live renderer uses
        // (seed from connectionId chars) so playback is identical.
        const appId = 'r' + rc.connectionId;
        if (!this._replayAppearances.has(appId)) {
          const seed = this.remoteSeed(rc.connectionId);
          this._replayAppearances.set(appId, this.botAppearanceFor(seed % 1000, seed));
        }
        rcars.push({
          x: rc.x, z: rc.z, yaw: rc.yaw, speed: rc.speed,
          accel: dt > 0 ? (rc.speed - prev) / dt : 0, slide: rc.slide,
          id: appId, r: rc.colorR, g: rc.colorG, b: rc.colorB,
          dist: rc.lap * this.renderer.totalTrackDist + rc.distance, name: rc.playerName
        });
      });
      this._replayFrames.push({
        t: this.totalRaceTime,
        px: this.carX, pz: this.carZ, pyaw: this.carYaw,
        pspd: this.carSpeed, pacc: this.carAccel, pslid: this._playerSlide,
        pdist: this._playerRaceDist,
        cars: rcars
      });
      if (this.profile) this.pMark('replay');
      if (this.isOffTrack) {
        this.screenShake = Math.min(0.04, this.screenShake + dt * 0.02);
      } else {
        this.screenShake *= 0.9;
      }
      if (this._mpLobbyTrackId) {
        this._positionSyncTimer += dt;
        if (this._positionSyncTimer > 0.1) {
          this._positionSyncTimer = 0;
          this.racingHub.syncPosition(this._mpLobbyTrackId, {
            connectionId: this.racingHub.myConnectionId || '',
            x: this.carX, z: this.carZ,
            yaw: this.carYaw, speed: this.carSpeed,
            distance: this.carDist, currentLap: this.currentLap,
            isOffTrack: this.isOffTrack,
            totalTrackDist: this.renderer?.totalTrackDist || 0,
            raceDist: this._playerRaceDist,
          });
        }
      }
    }
    this.updateEngineAudio();
    if (this.renderer) {
      const whistles = this.renderer.consumeMarmotWhistle();
      for (let i = 0; i < whistles; i++) this.playMarmotWhistle();
    }
    if (this.renderer && this.isLoaded) {
      if (this.gameState === 'finished' && this._replayFrames.length > 1) {
        this.renderReplay(dt);
        return;
      }
      if (this.gameState === 'garage') {
        const vp = this.getGarageStageViewport();
        if (vp) {
          this.renderer.renderGarage(this.carRotateY, this.carRotateX, this.carZoom,
            this.getPreviewAppearance(), vp, dt);
        }
        return;
      }
      const aspect = this.canvasRef.nativeElement.width / this.canvasRef.nativeElement.height;
      let eyeX = this.carX;
      let eyeZ = this.carZ;
      // Camera rides the terrain: eye height = road elevation + 0.5, and the
      // pitch noses up/down with the grade so climbs and descents read live.
      const pElev = this.renderer.getTrackElevation(this.carDist);
      const pBank = this.renderer.getTrackBank(this.carDist);
      const pLat = this.renderer.getTrackLateral(this.carX, this.carZ);
      const grade = this.renderer.getTrackGrade(this.carDist);
      // Camera rides the bank too: on a banked corner it sits up/down with the
      // lateral tilt so the world reads as tilted, not the car.
      let eyeY = pElev + pBank * pLat + 0.5;
      let pitch = -0.05 + (this.carSpeed / this.getMaxSpeed()) * 0.03 + grade * 0.06;
      let yaw = this.carYaw;
      const speedRatio = Math.abs(this.carSpeed) / this.getMaxSpeed();
      // FOV rides the grade too: descents open the view up (faster feel),
      // climbs pull it in — the road itself keeps pitching on top of that.
      const fovZoom = this.speedFovOn
        ? Math.max(0.8, Math.min(1.2, 1.0 - speedRatio * 0.15 - grade * 0.12))
        : 1.0;
      const shakeX = this.cameraShakeOn ? this.screenShake * (Math.random() - 0.5) * 2 : 0;
      const shakeY = this.cameraShakeOn ? this.screenShake * (Math.random() - 0.5) * 2 : 0;
      // Countdown cinematic: orbit the starting grid while the lights count
      // down, then blend back to the cockpit camera right after GO.
      const panCam = this.countdownPanCamera(eyeX, eyeY, eyeZ, yaw, pitch);
      if (panCam) {
        eyeX = panCam.eyeX; eyeY = panCam.eyeY; eyeZ = panCam.eyeZ;
        yaw = panCam.yaw; pitch = panCam.pitch;
      }
      const countdownPanActive = panCam !== null;
      if (this.cockpitDashEl?.nativeElement) {
        this.cockpitDashEl.nativeElement.classList.toggle('pan-hidden', countdownPanActive);
      }
      const accelFor = (obj: { speed: number }, prev: number) =>
        dt > 0 ? (obj.speed - prev) / dt : 0;
      const wheelRate = (spd: number) => Math.min(Math.abs(spd) / 0.17, 40) * (spd < 0 ? 1 : -1);
      // Reused per-frame car slots — the previous version built a fresh object
      // literal (plus appearance spread) per car every frame; slots are filled
      // in place and the array only holds references.
      const carList = this._carListArr;
      carList.length = 0;
      for (let bi = 0; bi < this.bots.length; bi++) {
        const b = this.bots[bi];
        const c = this.getBotColorRGB(b.color);
        const prev = this._prevBotSpeeds.get(b) ?? b.speed;
        this._prevBotSpeeds.set(b, b.speed);
        const spin = (this._botSpins.get(b) ?? 0) + wheelRate(b.speed) * dt;
        this._botSpins.set(b, spin);
        const botAccel = b.brakeCommitment !== undefined ? -b.brakeCommitment : accelFor(b, prev);
        const bBank = this.renderer.getTrackBank(b.dist);
        const s = this.carSlotAt(carList.length);
        s.x = b.x; s.y = this.renderer.getTrackElevation(b.dist) + bBank * this.renderer.getTrackLateral(b.x, b.z) + 0.1; s.z = b.z; s.yaw = b.yaw;
        s.r = c[0]; s.g = c[1]; s.b = c[2];
        s.speed = b.speed; s.accel = botAccel; s.spin = spin; s.slide = b.slide;
        s.id = b.id; s.bank = bBank;
        this.fillBotAppearance(s, bi, b.color);
        carList.push(s);
      }
      this.remoteCars.forEach((rc) => {
        const prev = this._prevRemoteSpeeds.get(rc.connectionId) ?? rc.speed;
        this._prevRemoteSpeeds.set(rc.connectionId, rc.speed);
        const spin = (this._remoteSpins.get(rc.connectionId) ?? 0) + wheelRate(rc.speed) * dt;
        this._remoteSpins.set(rc.connectionId, spin);
        const seed = this.remoteSeed(rc.connectionId);
        const i = seed % 1000;
        const rcDist = rc.lap * this.renderer.totalTrackDist + (rc.distance ?? 0);
        const rcBank = this.renderer.getTrackBank(rcDist);
        const s = this.carSlotAt(carList.length);
        s.x = rc.x; s.y = this.renderer.getTrackElevation(rcDist) + rcBank * this.renderer.getTrackLateral(rc.x, rc.z) + 0.1; s.z = rc.z;
        s.yaw = rc.yaw;
        s.r = rc.colorR; s.g = rc.colorG; s.b = rc.colorB;
        s.speed = rc.speed;
        s.accel = accelFor(rc, prev);
        s.spin = spin;
        s.slide = rc.slide;
        s.id = 'r' + rc.connectionId; s.bank = rcBank;
        this.fillBotAppearance(s, i, seed);
        carList.push(s);
      });
      // During the countdown pan the camera is away from the car, so add the
      // player's own car to the scene — it is normally the camera host and
      // therefore not rendered in the main view.
      const pa = this.getPlayerAppearance();
      if (countdownPanActive) {
        const skin = pa.skin ?? [0.85, 0.06, 0.06];
        const pBank = this.renderer.getTrackBank(this.carDist);
        const s = this.carSlotAt(carList.length);
        s.x = this.carX;
        s.y = this.renderer.getTrackElevation(this.carDist) + pBank * this.renderer.getTrackLateral(this.carX, this.carZ) + 0.1;
        s.z = this.carZ; s.yaw = this.carYaw;
        s.r = skin[0]; s.g = skin[1]; s.b = skin[2];
        s.speed = 0; s.accel = 0; s.spin = 0; s.slide = 0;
        s.id = 'player'; s.bank = pBank;
        s.rimStyle = pa.rimStyle; s.spoilerId = pa.spoilerId; s.exhaustId = pa.exhaustId;
        s.accent = pa.accent; s.decalStyle = pa.decalStyle; s.glow = pa.glow;
        s.glowIntensity = pa.glowIntensity; s.metallic = pa.metallic; s.skin = pa.skin;
        carList.push(s);
      }
      this._playerSpin += wheelRate(this.carSpeed) * dt;
      // The rear-view mirror is meaningless while the cinematic pan is active.
      this.renderer.render(eyeX, eyeY, eyeZ, yaw, pitch, aspect, carList, dt, fovZoom, shakeX, shakeY, this.isRaining, speedRatio, this.carSpeed, this.carAccel, this._playerSpin, this._playerSlide, pa, countdownPanActive, this.steerSmoothed / 90);
      if (this.profile) this.pMark('render');
      this.hudSpeed = Math.abs(this.carSpeed * 3.6);
      this.hudRPM = this.gameState === 'countdown'
        ? Math.min(1, this._countdownRev * 1.2)
        : Math.min(1, Math.abs(this.carSpeed) / this.getMaxSpeed() * 1.1);
      this.hudBrakeHeat = this.renderer?.getPlayerBrakeHeat() ?? 0;
      if (this.hudBrakeHeat > this._brakePeakThisLap) this._brakePeakThisLap = this.hudBrakeHeat;
      this.hudWheelLock = this.renderer?.getPlayerLock() ?? 0;
      this.liveLapTime = this.lapStartTime > 0 ? performance.now() - this.lapStartTime : 0;
      const targetSteer = -this.carSteer * 35;
      this.steerSmoothed += (targetSteer - this.steerSmoothed) * Math.min(1, dt * 8);
      if (this.steerWheelEl?.nativeElement) {
        this.steerWheelEl.nativeElement.style.transform = `rotate(${this.steerSmoothed}deg)`;
      }
      if (this.wheelSpeedEl?.nativeElement) {
        this.wheelSpeedEl.nativeElement.textContent = Math.round(this.hudSpeed).toString();
      }
      if (this.wheelRpmEl?.nativeElement) {
        const rpm = Math.round(this.hudRPM * 100);
        this.wheelRpmEl.nativeElement.style.width = rpm + '%';
        this.wheelRpmEl.nativeElement.className = 'wheel-rpm-fill' +
          (this.hudRPM > 0.95 ? ' rpm-redline' : this.hudRPM > 0.85 ? ' rpm-high' : '');
      }
      if (this.wheelGearEl?.nativeElement) {
        this.wheelGearEl.nativeElement.textContent = this.getGear();
      }
      // Pedal-state bars: mirror the gas/brake press onto the wheel face so
      // the touch state reads even when the pedals sit low on screen (mobile).
      // carAccel is ±1/0 from processInput, so the bars show binary press
      // state — they fill during countdown revving too.
      if (this.thrFillEl?.nativeElement && this.brkFillEl?.nativeElement) {
        const thr = Math.max(0, this.carAccel);
        const brk = Math.max(0, -this.carAccel);
        this.thrFillEl.nativeElement.style.width = (thr * 100).toFixed(1) + '%';
        this.brkFillEl.nativeElement.style.width = (brk * 100).toFixed(1) + '%';
      }
      if (this.brakeFillEl?.nativeElement && this.brakePeakEl?.nativeElement) {
        const state = this.getBrakeHeatState();
        const pct = this.getBrakeHeatPercent();
        const peakPct = this.getBrakePeakPercent();
        const fill = this.brakeFillEl.nativeElement;
        const peak = this.brakePeakEl.nativeElement;
        fill.style.width = pct + '%';
        peak.style.left = peakPct + '%';
        fill.parentElement?.setAttribute('title',
          `Brake heat ${pct.toFixed(0)}% — peak ${peakPct.toFixed(0)}% this lap`);
        this.brakeGaugeEl?.nativeElement.classList.toggle('brake-temp-hot', state === 'hot');
        this.brakeGaugeEl?.nativeElement.classList.toggle('brake-temp-warm', state === 'warm');
        this.brakeStateEl?.nativeElement.classList.toggle('brake-temp-state-hot', state === 'hot');
        if (this.brakeStateEl?.nativeElement) {
          this.brakeStateEl.nativeElement.textContent = state === 'hot' ? 'HOT' : state === 'warm' ? 'WARM' : 'COOL';
        }
      }
      if (this.wheelLedFlEl?.nativeElement && this.wheelLedFrEl?.nativeElement) {
        const front = 1 - this.hudWheelLock;
        this.wheelLedFlEl.nativeElement.style.opacity = front.toFixed(3);
        this.wheelLedFrEl.nativeElement.style.opacity = front.toFixed(3);
        this.wheelLedsEl?.nativeElement.setAttribute('title',
          `Front-wheel lock ${Math.round(this.hudWheelLock * 100)}% — fronts dim as they lock`);
      }
    }
    if (this.profile) {
      this.pMark('frame');
      this._profFrames++;
      if (this._profFrames >= 120) this.profileSample();
    }
  }
  private processInput(dt: number) {
    let gas = 0, brake = 0, steerTarget = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) gas = 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) brake = 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) steerTarget = 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) steerTarget = -1;
    if (this.joyActive) {
      const dz = 0.18;
      const x = Math.abs(this.joyX) > dz ? this.joyX : 0;
      if (x !== 0) steerTarget = -x * 0.7;
    }
    if (this.gasHeld) gas = 1;
    if (this.brakeHeld) brake = 1;
    const lerpSpeed = 3.5;
    this.keyboardSteerCurrent += (steerTarget - this.keyboardSteerCurrent) * Math.min(1, dt * lerpSpeed);
    if (Math.abs(this.keyboardSteerCurrent) < 0.002) this.keyboardSteerCurrent = 0;
    const s = this.keyboardSteerCurrent;
    this.carSteer = Math.sign(s) * Math.pow(Math.abs(s), 1.35);
    this.carAccel = gas - brake;
  }
  private updatePhysics(dt: number) {
    const maxSpeed = this.getMaxSpeed();
    const grip = 0.85 + this.getGripBonus() / 100;
    // Downforce (spoiler) adds to cornering grip the same way suspension does,
    // so a taller/multi-element wing measurably improves handling. Banked
    // corners give a free lateral-support bonus, so fast sweepers genuinely
    // reward holding the racing line like Monza.
    const corner = 0.8 + (this.getCornerBonus() + this.getDownforceBonus()) / 100
      + Math.abs(this.renderer?.getTrackBank(this.carDist) ?? 0) * 0.7;
    const brakeUpgrade = 1 + this.getBrakeBonus() / 100;
    let heatFade = 1;
    const discHeat = this.renderer?.getPlayerBrakeHeat() ?? 0;
    if (discHeat > BRAKE_HEAT_FADE_ON) {
      const t = Math.min(1, (discHeat - BRAKE_HEAT_FADE_ON) / (BRAKE_HEAT_FADE_TOP - BRAKE_HEAT_FADE_ON));
      heatFade = 1 - BRAKE_HEAT_FADE_AMOUNT * t;
    }
    const lock = this.renderer?.getPlayerLock() ?? 0;
    const lockGrip = 1 - BRAKE_LOCK_UNDERSTEER * lock;
    const lockBrake = 1 - BRAKE_LOCK_DECEL_LOSS * lock;
    const brakeForce = BRAKE_FORCE * brakeUpgrade * heatFade * lockBrake;
    const speedAbs = Math.abs(this.carSpeed);
    const speedRatio = speedAbs / maxSpeed;
    const speedFactor = Math.min(1, speedAbs / 3.0);
    const turnFactor = Math.max(0.28, 1 - speedRatio * speedRatio * 0.72);
    const brakeGrip = this.carAccel < 0 ? 1.15 : 1.0;
    const weatherGrip = this.isRaining ? 0.72 : 1.0;
    const effGrip = grip * brakeGrip * weatherGrip;
    const maxYawRate = (speedAbs > 0.5 ? (LAT_ACCEL * effGrip * (corner / 0.8)) / speedAbs : 99) * lockGrip;
    const slidePrev = Math.min(1, Math.abs(this.slipAngle) / SLIP_FULL);
    const rackYawRate = this.carSteer * TURN_SPEED * turnFactor * speedFactor * corner * 60
      * (1 - SLIP_GRIP_CUT * slidePrev) * lockGrip;
    const yawRate = Math.max(-MAX_RACK_YAW, Math.min(MAX_RACK_YAW, rackYawRate));
    if (this.carSpeed > 0.5) {
      this.carYaw += yawRate * dt;
      let dirDiff = this.carYaw - this.carDir;
      while (dirDiff > Math.PI) dirDiff -= Math.PI * 2;
      while (dirDiff < -Math.PI) dirDiff += Math.PI * 2;
      const maxDirStep = maxYawRate * dt;
      this.carDir += Math.max(-maxDirStep, Math.min(maxDirStep, dirDiff));
    } else if (this.carSpeed < -0.5) {
      this.carDir = this.carYaw + Math.PI;
    } else {
      this.carDir = this.carYaw;
    }
    let slip = 0;
    if (this.carSpeed > 0.5) {
      slip = this.carYaw - this.carDir;
      while (slip > Math.PI) slip -= Math.PI * 2;
      while (slip < -Math.PI) slip += Math.PI * 2;
    }
    this.slipAngle = slip;
    const slide = Math.min(1, Math.abs(slip) / SLIP_FULL);
    this._playerSlide = slide;
    if (this.carAccel > 0) {
      const traction = 1 - 0.6 * slide;
      // Perfect-launch bonus: a timed, revved launch at the lights gives a
      // brief accel multiplier (a grip-rich hole-shot) — small but tangible.
      const launch = this._launchBoostTimer > 0 ? 1.3 : 1;
      if (this._launchBoostTimer > 0) this._launchBoostTimer -= dt;
      this.carSpeed += ACCEL * (1 + this.getWeightBonus() / 200) * traction * launch * dt;
    } else if (this.carAccel < 0) {
      this.carSpeed -= brakeForce * dt;
    } else {
      this.carSpeed *= (1 - (1 - FRICTION) * dt * 60);
    }
    if (slide > 0.02) {
      this.carSpeed *= Math.exp(-SLIP_DRAG * slide * dt);
      this.screenShake = Math.max(this.screenShake, slide * 0.012);
    }
    this.carSpeed = Math.max(-maxSpeed * 0.3, Math.min(maxSpeed, this.carSpeed));
    const travelYaw = this.carSpeed < 0 ? this.carYaw + Math.PI : this.carDir;
    const dx = Math.sin(travelYaw) * this.carSpeed * dt;
    const dz = Math.cos(travelYaw) * this.carSpeed * dt;
    this.carX += dx;
    this.carZ += dz;
    const trackDist = this.renderer.getDistFromPoint(this.carX, this.carZ);
    const tp = this.renderer.getTrackPointAlong(trackDist);
    const expectedDir = Math.atan2(tp.dirX, tp.dirZ);
    const travelHeading = this.carDir;
    let headingDiff = travelHeading - expectedDir;
    while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
    while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
    const facingWrong = Math.abs(headingDiff) > Math.PI / 2 && Math.abs(this.carSpeed) > 3;
    if (facingWrong) this._wrongWayTimer += dt; else this._wrongWayTimer = 0;
    const wasWrong = this.wrongWay;
    this.wrongWay = this._wrongWayTimer > 0.7;
    if (this.wrongWay && !wasWrong && !this._wrongWayShown) {
      this._wrongWayShown = true;
      this.addMessage('⚠️ WRONG WAY! Correcting…');
    }
    if (!this.wrongWay && this._wrongWayShown) this._wrongWayShown = false;
    const offForward = Math.abs(headingDiff) > Math.PI / 2;
    if (this.wrongWay) this._wrongWaySliding = true;
    if (this._wrongWaySliding && offForward) {
      if (Math.abs(this.carSpeed) > 1) {
        this.carSpeed -= WRONG_WAY_SPEED_DRAIN * dt * Math.sign(this.carSpeed);
      }
      const targetYaw = expectedDir;
      let yawDiff = this.carYaw - targetYaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      this.carYaw += Math.max(-WRONG_WAY_YAW_RATE * dt, Math.min(WRONG_WAY_YAW_RATE * dt, -yawDiff));
      let dirDiff = this.carDir - targetYaw;
      while (dirDiff > Math.PI) dirDiff -= Math.PI * 2;
      while (dirDiff < -Math.PI) dirDiff += Math.PI * 2;
      this.carDir += Math.max(-WRONG_WAY_YAW_RATE * dt, Math.min(WRONG_WAY_YAW_RATE * dt, -dirDiff));
      const pullX = tp.x - this.carX;
      const pullZ = tp.z - this.carZ;
      const pullLen = Math.hypot(pullX, pullZ);
      if (pullLen > 0.0001) {
        const step = Math.min(pullLen, WRONG_WAY_PULL_SPEED * dt);
        this.carX += (pullX / pullLen) * step;
        this.carZ += (pullZ / pullLen) * step;
      }
    } else if (!offForward) {
      this._wrongWaySliding = false;
    }
    const dxTrack = this.carX - tp.x;
    const dzTrack = this.carZ - tp.z;
    const distFromCenter = Math.hypot(dxTrack, dzTrack);
    const halfWidth = (tp.width || 16) / 2;
    const barrierDist = halfWidth + 1.5;
    const wheelReach = 0.5;
    if (distFromCenter > halfWidth - wheelReach && distFromCenter < barrierDist - 0.3 && Math.abs(this.carSpeed) > 1) {
      this.carSpeed *= Math.pow(CURB_DRAG, dt * 60);
      this.screenShake = Math.max(this.screenShake, 0.02);
    }
    const onWall = distFromCenter > barrierDist;
    if (onWall) {
      const normX = dxTrack / distFromCenter;
      const normZ = dzTrack / distFromCenter;
      const targetDist = barrierDist - 0.3;
      const toX = tp.x + normX * targetDist - this.carX;
      const toZ = tp.z + normZ * targetDist - this.carZ;
      const toLen = Math.hypot(toX, toZ);
      if (toLen > 0.0001) {
        const step = Math.min(toLen, 1.5);
        this.carX += (toX / toLen) * step;
        this.carZ += (toZ / toLen) * step;
      }
      const vx = Math.sin(this.carDir) * this.carSpeed;
      const vz = Math.cos(this.carDir) * this.carSpeed;
      const intoWall = vx * normX + vz * normZ;
      const tX = -normZ;
      const tZ = normX;
      const along = vx * tX + vz * tZ;
      if (!this._wasOnWall && intoWall > 0) {
        const impactAngle = Math.abs(intoWall) / Math.max(0.01, Math.hypot(vx, vz));
        const retain = 1 - impactAngle * 0.7;
        const targetYaw = Math.atan2(tX * (along >= 0 ? 1 : -1), tZ * (along >= 0 ? 1 : -1));
        let yawDiff = targetYaw - this.carYaw;
        while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
        while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
        this.carYaw += yawDiff * 0.4;
        this.carDir += yawDiff * 0.4;
        this.slipAngle = this.carYaw - this.carDir;
        this.carSpeed = Math.sign(this.carSpeed || 1) * Math.abs(along) * retain * 0.92;
        this.screenShake = Math.max(0.04, Math.min(0.12, Math.abs(intoWall) / 300));
      }
      if (Math.abs(along) > 1) {
        const tangentYaw = Math.atan2(tX * (along >= 0 ? 1 : -1), tZ * (along >= 0 ? 1 : -1));
        let yawDiff = tangentYaw - this.carYaw;
        while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
        while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
        this.carYaw += yawDiff * 0.06;
        this.carDir += yawDiff * 0.06;
      }
    }
    this._wasOnWall = onWall;
    {
      const myX = this.carX, myZ = this.carZ, mySpeed = this.carSpeed;
      const minDist = CAR_RADIUS * 2;
      this._carImpactCooldown -= dt;
      // Reused slots — no fresh array/objects per frame (see _nearbyCarSlots).
      const slots = this._nearbyCarSlots;
      let nCars = 0;
      for (const bot of this.bots) {
        if (!bot.alive) continue;
        let s = slots[nCars];
        if (!s) { s = { x: 0, z: 0, yaw: 0, speed: 0, isBot: true, ref: null }; slots[nCars] = s; }
        s.x = bot.x; s.z = bot.z; s.yaw = bot.yaw; s.speed = bot.speed; s.isBot = true; s.ref = bot;
        nCars++;
      }
      for (const [, rc] of this.remoteCars) {
        let s = slots[nCars];
        if (!s) { s = { x: 0, z: 0, yaw: 0, speed: 0, isBot: false, ref: null }; slots[nCars] = s; }
        s.x = rc.x; s.z = rc.z; s.yaw = rc.yaw; s.speed = rc.speed; s.isBot = false; s.ref = rc;
        nCars++;
      }
      for (let k = 0; k < nCars; k++) {
        const other = slots[k];
        const dxC = myX - other.x;
        const dzC = myZ - other.z;
        const dist = Math.hypot(dxC, dzC);
        if (dist < minDist && dist > 0.01) {
          const pushX = dxC / dist;
          const pushZ = dzC / dist;
          const overlap = minDist - dist;
          const push = Math.min(overlap, 0.6);
          this.carX += pushX * push * 0.5;
          this.carZ += pushZ * push * 0.5;
          if (other.isBot) {
            other.ref.x -= pushX * push * 0.5;
            other.ref.z -= pushZ * push * 0.5;
          }
          const myVx = Math.sin(this.carDir) * mySpeed;
          const myVz = Math.cos(this.carDir) * mySpeed;
          const theirVx = Math.sin(other.yaw) * other.speed;
          const theirVz = Math.cos(other.yaw) * other.speed;
          // relV > 0 = the player is closing into the other car; relV < 0 = the
          // other car rear-ends/side-swipes the player. Either way the NPC eats
          // the bump: an immediate speed cut plus a recovery timer so its pace
          // stays dented for a moment instead of snapping straight back.
          const relV = (myVx - theirVx) * pushX + (myVz - theirVz) * pushZ;
          const impact = Math.abs(relV);
          if (impact > 1 && this._carImpactCooldown <= 0) {
            this._carImpactCooldown = 0.3;
            const hit = Math.min(impact * 0.35, 8);
            if (relV > 0) this.carSpeed -= hit * 0.7;
            if (other.isBot) {
              other.ref.speed -= hit * 0.5;
              other.ref.hitSlowTimer = Math.max(other.ref.hitSlowTimer, Math.min(HIT_SLOW_MAX, 0.45 + impact * 0.055));
            }
            this.carYaw += (Math.random() - 0.5) * 0.02;
            if (other.isBot) other.ref.yaw += (Math.random() - 0.5) * 0.02;
            this.screenShake = Math.max(0.02, Math.min(0.08, impact * 0.01));
            // Paint flecks fly off the bodywork at the contact point, coloured
            // like the car that got hit (bot paint or the remote player's).
            const chipCol: [number, number, number] = other.isBot
              ? this.getBotColorRGB(other.ref.color)
              : [other.ref.colorR ?? 0.85, other.ref.colorG ?? 0.06, other.ref.colorB ?? 0.06];
            this.renderer?.emitPaintChips(
              (this.carX + other.x) / 2, (this.carZ + other.z) / 2,
              Math.atan2(other.x - this.carX, other.z - this.carZ),
              chipCol, Math.min(1, impact / 20));
            this.playImpactSound(Math.min(1, impact / 20), 1);
          }
        }
      }
    }
    if (distFromCenter > halfWidth + 5) {
      this.isOffTrack = true;
      this.offTrackTimer += dt;
      this.carSpeed *= OFF_TRACK_DRAG;
      const pullX = tp.x - this.carX;
      const pullZ = tp.z - this.carZ;
      const pullDist = Math.hypot(pullX, pullZ);
      if (pullDist > 0.1) {
        this.carX += (pullX / pullDist) * 5 * dt;
        this.carZ += (pullZ / pullDist) * 5 * dt;
      }
    } else {
      this.isOffTrack = false;
      this.offTrackTimer = 0;
    }
    // Terrain grade: gentle gravity assist on descents, mild drag on climbs —
    // every circuit's elevation profile now physically pulls or holds the car.
    const grade = this.renderer?.getTrackGrade(trackDist) ?? 0;
    if (grade !== 0) this.carSpeed += grade * 1.3 * dt;
    this.carDist = trackDist;
    if (Math.abs(this.keyboardSteerCurrent) < 0.1) {
      let yawDiff = expectedDir - this.carYaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      if (Math.abs(yawDiff) > 0.15) {
        this.carYaw += Math.sign(yawDiff) * Math.min(Math.abs(yawDiff), 0.01);
        let dirDiff = expectedDir - this.carDir;
        while (dirDiff > Math.PI) dirDiff -= Math.PI * 2;
        while (dirDiff < -Math.PI) dirDiff += Math.PI * 2;
        this.carDir += Math.sign(dirDiff) * Math.min(Math.abs(dirDiff), 0.01);
      }
    }
  }
  private updateBots(dt: number) {
    for (const bot of this.bots) {
      const prevBotDist = bot.dist;
      const prevYaw = bot.yaw;
      const botHeat = this.renderer?.getCarBrakeHeat(bot.id) ?? 0;
      const heatComfort = 0.55 + bot.config.aggression * 0.6;   
      const heatPenalty = botHeat > heatComfort
        ? Math.min(1, (botHeat - heatComfort) / (BRAKE_HEAT_FADE_TOP - heatComfort))
        : 0;
      const lookDist = bot.dist + AI_LOOKAHEAD * 5 * (1 + heatPenalty * 0.4);
      const target = this.renderer.getTrackPointAlong(lookDist);
      // Hard bots track the player's engine upgrades at full rate (bonus/100) so
      // they always press the ~95% max-speed cap below and stay a challenge for
      // fully-upgraded players; easy/medium only get half the player's boost
      // (bonus/200) so they remain beatable at every upgrade level.
      const upgradeScale = bot.config.difficulty === 'hard' ? 100 : 200;
      const baseSpeed = bot.config.speedBase * bot.pace * (1 + this.getSpeedBonus() / upgradeScale);
      const maxBotSpeed = Math.min(baseSpeed + bot.config.speedVariance, this.getMaxSpeed() * 0.95 * (0.9 + bot.pace * 0.1));
      const pdxP = this.carX - bot.x;
      const pdzP = this.carZ - bot.z;
      const playerDist = Math.hypot(pdxP, pdzP);
      let blockLane = 0;
      let defensiveBrake = 1;
      if (bot.config.aggression > 0.05 && playerDist < 10) {
        const fwdX = Math.sin(bot.yaw);
        const fwdZ = Math.cos(bot.yaw);
        const latX = fwdZ;
        const latZ = -fwdX;
        const across = pdxP * latX + pdzP * latZ;
        const along = pdxP * fwdX + pdzP * fwdZ;
        const proximity = Math.max(0, 1 - playerDist / 10);
        if (Math.abs(along) < 8) {
          const side = Math.abs(across) > 0.8 ? Math.sign(across) : (Math.random() - 0.5);
          blockLane = -side * proximity * bot.config.aggression * 2.2;
        }
        if (along < -1 && along > -6) defensiveBrake = 1 - bot.config.aggression * 0.25;
      }
      const effLane = bot.laneOffset + blockLane;
      const tpx = -target.dirZ;
      const tpz = target.dirX;
      const tx = target.x + tpx * effLane;
      const tz = target.z + tpz * effLane;
      const dx = tx - bot.x;
      const dz = tz - bot.z;
      const targetYaw = Math.atan2(dx, dz);
      let yawDiff = targetYaw - bot.yaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      const cornerSharpness = Math.abs(yawDiff);
      // Rare catastrophic corner crash: only in real corners, scaled by how
      // careless the bot is — skilled bots almost never lose it.
      if (bot.crashTimer <= 0 && bot.rimBumpTimer <= 0 && bot.mistakeTimer <= 0 && cornerSharpness > 0.25 && bot.speed > maxBotSpeed * 0.2) {
        // Events per second while in a corner; a floor keeps even skilled bots
        // from literally never crashing (rate below is ~1/min at the floor).
        const crashChance = Math.max(0.0012, bot.config.mistakeChance * 0.012 * (1 - bot.config.cornerSkill * 0.7));
        if (Math.random() < crashChance * dt * 60) {
          bot.crashTimer = 1.2 + Math.random() * 1.4;
          bot.crashSpinDir = Math.random() < 0.5 ? -1 : 1;
          bot.crashDuration = bot.crashTimer;
          // Visible spin-out: dense tire-smoke burst at the car plus a brief crowd
          // reaction (audible applause + animated frenzy) at the moment of impact.
          this.renderer?.emitCrashSmoke(bot.x, bot.z, bot.yaw, bot.speed);
          this.renderer?.exciteCrowd(0.6);
          // Cooldown so a pileup doesn't stack overlapping applause buffers.
          const now = performance.now();
          if (now - (this._lastBotCrashCheer ?? 0) > 1500) {
            this._lastBotCrashCheer = now;
            this.playCrowdCheer('applause', 0.45);
          }
        }
      }
      const crashing = bot.crashTimer > 0;
      if (crashing) {
        // Loss of control: hard spin + heavy speed bleed — the bot veers off line.
        bot.crashTimer -= dt;
        const spinT = Math.max(0.15, bot.crashTimer / Math.max(0.001, bot.crashDuration));
        bot.yaw += bot.crashSpinDir * (0.8 + (1 - spinT) * 1.6) * dt * (1 - bot.config.cornerSkill * 0.3);
        bot.speed *= Math.pow(0.6, dt * 60);
        bot.slide = Math.max(bot.slide, 0.95);
      } else {
        bot.yaw += yawDiff * bot.config.cornerSkill * 0.1;
        bot.yaw += (Math.random() - 0.5) * (1 - bot.config.cornerSkill) * 0.02 * (0.3 + cornerSharpness);
      }
      const rimBumping = bot.rimBumpTimer > 0;
      if (rimBumping) {
        bot.rimBumpTimer -= dt;
        bot.slide = Math.max(bot.slide, 0.4);
      }
      if (bot.hitSlowTimer > 0) bot.hitSlowTimer = Math.max(0, bot.hitSlowTimer - dt);
      // Collision knock: pace stays dented while the recovery timer drains,
      // easing back to full speed — so a bump visibly costs the bot a moment.
      const hitSlow = bot.hitSlowTimer > 0
        ? 0.4 + 0.6 * (1 - Math.min(1, bot.hitSlowTimer / HIT_SLOW_MAX))
        : 1;
      const cornerSlow = Math.max(0.4, 1 - cornerSharpness * 0.8);
      const rimSlow = rimBumping ? 0.62 : 1;
      const crashSlow = crashing ? 0.35 : 1;
      // Bots ride the same downhill/uphill grade as the player so hilly
      // circuits stay fair — they gain on the drop and lose a touch on the climb.
      const grade = this.renderer?.getTrackGrade(bot.dist) ?? 0;
      const targetSpeed = maxBotSpeed * cornerSlow * defensiveBrake * (1 - bot.config.mistakeChance * 0.3) * rimSlow * crashSlow * hitSlow * (1 + grade * 0.06);
      if (bot.mistakeTimer > 0) {
        bot.mistakeTimer -= dt;
        bot.speed *= 0.95;
      } else if (Math.random() < bot.config.mistakeChance * dt) {
        bot.mistakeTimer = 0.5 + Math.random() * 1;
      }
      let ease = 0.1;
      if (targetSpeed < bot.speed && cornerSharpness > 0.12) {
        const skill = 0.7 + bot.config.cornerSkill * 0.3;   
        const commitment = Math.max(0.35, skill * (1 - 0.85 * heatPenalty));
        ease = 0.04 + commitment * 0.09;
        bot.brakeCommitment = commitment;
      } else if (targetSpeed < bot.speed) {
        bot.brakeCommitment = 0.25;
      } else {
        bot.brakeCommitment = targetSpeed > bot.speed + 1 ? 0.7 : 0;
      }
      bot.speed += (targetSpeed - bot.speed) * ease;
      bot.speed = Math.max(0, Math.min(maxBotSpeed, bot.speed));
      const bdx = Math.sin(bot.yaw) * bot.speed * dt;
      const bdz = Math.cos(bot.yaw) * bot.speed * dt;
      bot.x += bdx;
      bot.z += bdz;
      bot.dist = this.renderer.getDistFromPoint(bot.x, bot.z);
      const yawRate = Math.abs(bot.yaw - prevYaw) / Math.max(0.0001, dt);
      const speedFactor = Math.min(1, Math.abs(bot.speed) / 8);
      bot.slide = Math.min(1, (yawRate / 3.5) * speedFactor);
      const curTP = this.renderer.getTrackPointAlong(bot.dist);
      const ppx = -curTP.dirZ;
      const ppz = curTP.dirX;
      const laneX = curTP.x + ppx * effLane;
      const laneZ = curTP.z + ppz * effLane;
      // While losing control the bot barely pulls back to the line (so the
      // spin/veer reads visually); once recovered the snap returns and it
      // re-centers cleanly on the racing line.
      const snap = crashing ? 0.012 : 0.05 + bot.config.cornerSkill * 0.08;
      bot.x += (laneX - bot.x) * snap;
      bot.z += (laneZ - bot.z) * snap;
      const botDxT = bot.x - curTP.x;
      const botDzT = bot.z - curTP.z;
      const botOff = Math.hypot(botDxT, botDzT);
      const botHalf = (curTP.width || 16) / 2;
      const botBarrier = botHalf + 1.5;
      if (botOff > botBarrier) {
        bot.speed *= Math.pow(0.9, dt * 60);
        bot.yaw += (Math.random() - 0.5) * 0.25;
        bot.slide = Math.max(bot.slide, 0.9);
        const scale = (botBarrier - 0.3) / botOff;
        bot.x = curTP.x + botDxT * scale;
        bot.z = curTP.z + botDzT * scale;
      } else if (botOff > botHalf) {
        bot.speed *= Math.pow(CURB_DRAG, dt * 60);
        bot.slide = Math.max(bot.slide, 0.35);
        // The rim occasionally bites hard — a brief sharp slowdown, then the
        // bot backs off and re-centers on its line.
        if (bot.rimBumpTimer <= 0 && bot.crashTimer <= 0 && Math.random() < dt * 0.3 * (0.3 + bot.config.mistakeChance * 2)) {
          bot.rimBumpTimer = 0.5 + Math.random() * 0.8;
        }
      }
      let delta = bot.dist - prevBotDist;
      if (delta < -this.renderer.totalTrackDist * 0.5) delta += this.renderer.totalTrackDist;
      else if (delta > this.renderer.totalTrackDist * 0.5) delta -= this.renderer.totalTrackDist;
      bot.raceDist += delta;
      const prevBotLap = bot.lap;
      bot.lap = Math.max(0, Math.floor(bot.raceDist / this.renderer.totalTrackDist));
      if (bot.lap > prevBotLap && bot.lapStart > 0) {
        const botLapMs = performance.now() - bot.lapStart;
        if (botLapMs > 0 && (bot.bestLap === 0 || botLapMs < bot.bestLap)) bot.bestLap = botLapMs;
        bot.lapStart = performance.now();
      }
    }
    this._botImpactCooldown -= dt;
    for (let i = 0; i < this.bots.length; i++) {
      const a = this.bots[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < this.bots.length; j++) {
        const b = this.bots[j];
        if (!b.alive) continue;
        const abx = b.x - a.x;
        const abz = b.z - a.z;
        const abd = Math.hypot(abx, abz);
        const minD = CAR_RADIUS * 2;
        if (abd < minD && abd > 0.01) {
          const push = (minD - abd) * 0.5;
          const nx = abx / abd;
          const nz = abz / abd;
          a.x -= nx * push; a.z -= nz * push;
          b.x += nx * push; b.z += nz * push;
          if (abd < minD * 0.65) {
            a.speed *= 0.97;
            b.speed *= 0.97;
            a.yaw += (Math.random() - 0.5) * 0.08;
            b.yaw += (Math.random() - 0.5) * 0.08;
            // NPC-on-NPC bumps dent both cars' pace and throw paint chips too.
            const knock = Math.min(1.2, (minD - abd) * 1.2);
            a.hitSlowTimer = Math.max(a.hitSlowTimer, Math.min(HIT_SLOW_MAX, 0.4 + knock));
            b.hitSlowTimer = Math.max(b.hitSlowTimer, Math.min(HIT_SLOW_MAX, 0.4 + knock));
            if (this._botImpactCooldown <= 0) {
              this._botImpactCooldown = 0.25;
              const mx = (a.x + b.x) * 0.5;
              const mz = (a.z + b.z) * 0.5;
              const dist = Math.hypot(mx - this.carX, mz - this.carZ);
              const reach = RacingComponent.REMOTE_AUDIBLE;
              const att = dist >= reach ? 0 : Math.pow(1 - dist / reach, 2);
              if (att > 0.02) this.playImpactSound(0.6, att * 0.5);
              const atan = Math.atan2(b.x - a.x, b.z - a.z);
              this.renderer?.emitPaintChips(mx, mz, atan, this.getBotColorRGB(a.color), 0.4);
              this.renderer?.emitPaintChips(mx, mz, atan + Math.PI, this.getBotColorRGB(b.color), 0.4);
            }
          }
        }
      }
    }
  }
  private checkLapCrossing() {
    const prevDist = this.lastCarDist;
    const trackLen = this.renderer.totalTrackDist;
    if (trackLen > 0) {
      let delta = this.carDist - prevDist;
      if (delta < -trackLen * 0.5) delta += trackLen;
      else if (delta > trackLen * 0.5) delta -= trackLen;
      this._playerRaceDist += delta;
    }
    const lapReached = trackLen > 0 ? Math.floor(this._playerRaceDist / trackLen) : 0;
    if (lapReached > this.currentLap) {
      this.currentLap = lapReached;
      this._brakePeakThisLap = 0;
      if (this.currentLap >= this.totalLaps) {
        if (this.racePosition !== 1) this.playCrowdCheer('big', 1.5);
      } else {
        const cheerTypes: ('roar' | 'whistle' | 'applause' | 'wave')[] = ['roar', 'whistle', 'applause', 'wave'];
        this.playCrowdCheer(cheerTypes[Math.floor(Math.random() * cheerTypes.length)], 1);
      }
      const lapTime = performance.now() - this.lapStartTime;
      this.lapTimes.push(lapTime);
      this.lastLapTime = lapTime;
      if (lapTime < this.bestLapTime) this.bestLapTime = lapTime;
      if (this.currentLap >= this.totalLaps) {
        this.finishRace();
      } else {
        this.lapStartTime = performance.now();
        this.addMessage(`Lap ${this.currentLap}: ${(lapTime / 1000).toFixed(2)}s`);
      }
    }
    this.lastCarDist = this.carDist;
  }
  private updateRacePosition() {
    const playerDist = this._playerRaceDist;
    const allRacers: { dist: number; isPlayer: boolean }[] = this.bots.map(b => ({
      dist: b.raceDist,
      isPlayer: false
    }));
    this.remoteCars.forEach(rc => {
      // Cumulative race distance (sent by the remote) ranks correctly from the
      // flag drop even for back-of-grid cars; fall back to the lap+distance
      // estimate when a remote hasn't reported one yet.
      const dist = typeof rc.raceDist === 'number'
        ? rc.raceDist
        : rc.distance + rc.lap * this.renderer.totalTrackDist;
      allRacers.push({ dist, isPlayer: false });
    });
    allRacers.push({ dist: playerDist, isPlayer: true });
    allRacers.sort((a, b) => b.dist - a.dist);
    const playerIdx = allRacers.findIndex(r => r.isPlayer);
    this.racePosition = playerIdx === -1 ? this.totalRacers : playerIdx + 1;
  }
  private async finishRace() {
    if (this._raceFinished) return;
    this._raceFinished = true;
    const totalTime = performance.now() - this.raceStartTime;
    this._lastRaceTotalTime = totalTime;
    if (this._mpLobbyTrackId && !this._mpFinished) {
      this._mpFinished = true;
      this.racingHub.finishRace(this._mpLobbyTrackId, this.racePosition, totalTime, this.currentLap);
    }
    this.buildFinalStandings();
    this.gameState = 'finished';
    this.renderer?.resetRaceFX();
    const basePrize = this.selectedTrack?.prizePool || 300;
    const positionMultiplier = Math.max(0.1, 1 - (this.racePosition - 1) * 0.15);
    const moneyEarned = Math.round(basePrize * positionMultiplier);
    this.playerCar.totalRaces++;
    this.playerCar.totalEarnings += moneyEarned;
    if (this.racePosition === 1) {
      this.playerCar.wins++;
      this.addMessage(`🏆 YOU WIN! +$${moneyEarned}`);
      this.renderer.celebrateWinner(Math.abs(this.carSpeed));
      this.renderer.exciteCrowd(1);
      this.playWinnerCheer();
    } else {
      this.addMessage(`Finished #${this.racePosition} of ${this.totalRacers} +$${moneyEarned}`);
    }
    this.playerCar.money += moneyEarned;
    const trackIdForLap = this.selectedTrack?.id ?? 1;
    if (this.bestLapTime > 0 && this.bestLapTime < 99999999) {
      this.playerCar.bestLapsByTrack = this.playerCar.bestLapsByTrack || {};
      const prevTrackBest = this.playerCar.bestLapsByTrack[trackIdForLap] || 0;
      if (!prevTrackBest || this.bestLapTime < prevTrackBest) {
        this.showRecordToast(prevTrackBest, this.bestLapTime, trackIdForLap);
        this.playerCar.bestLapsByTrack[trackIdForLap] = this.bestLapTime;
        await this.maybeCelebrateFriendBeat(trackIdForLap, prevTrackBest);
      }
      const trackBests = Object.values(this.playerCar.bestLapsByTrack).filter(v => v > 0);
      this.playerCar.bestLap = trackBests.length > 0 ? Math.min(...trackBests) : this.playerCar.bestLap;
    }
    this.saveCar();
    const result: RaceResult = {
      position: this.racePosition,
      playerId: this.parentRef?.user?.id ?? 0,
      playerName: this.playerCar.playerName?.trim() || this.parentRef?.user?.username || 'Player',
      lapTime: this.bestLapTime || totalTime,
      totalTime: totalTime,
      moneyEarned: moneyEarned,
      isBot: !this._mpLobbyTrackId,
      trackId: this.selectedTrack?.id ?? 1,
    };
    // Carry the full grid's laps — bots that completed at least one timed lap —
    // so the leaderboard reflects every racer's best time on the circuit.
    const botResults = this.bots
      .filter(b => b.alive && b.bestLap > 0)
      .map(b => ({
        playerId: b.pid,
        playerName: b.name,
        position: 0,
        lapTime: b.bestLap,
        trackId: this.selectedTrack?.id ?? 1,
      }));
    this.racingService.submitRaceResult(this.parentRef?.user?.id ?? 0, result, botResults);
    await this.loadLeaderboard();
    this.recordRankMovement();
  }
  /** Snapshot every racer's progress at the moment the player crosses the line
   *  and sort into the final classification shown on the results screen. */
  private buildFinalStandings() {
    const trackLen = this.renderer.totalTrackDist;
    const playerDist = this.currentLap * trackLen + this.carDist;
    const palette = ['#e53935', '#4a9eff', '#4caf50', '#ffd600', '#9c27b0', '#ff9800', '#00bcd4', '#e91e63'];
    const racers: { name: string; playerId: number; isBot: boolean; isPlayer: boolean; color: string; dist: number; laps: number; replayId?: string }[] = [];
    for (const b of this.bots) {
      if (!b.alive) continue;
      racers.push({
        name: b.name, playerId: 0, isBot: true, isPlayer: false,
        color: palette[b.color % palette.length],
        dist: b.raceDist,
        laps: b.lap,
        replayId: b.id,
      });
    }
    this.remoteCars.forEach(rc => {
      racers.push({
        name: rc.playerName, playerId: rc.playerId || 0, isBot: false, isPlayer: false,
        color: `rgb(${Math.round(rc.colorR * 255)}, ${Math.round(rc.colorG * 255)}, ${Math.round(rc.colorB * 255)})`,
        dist: rc.lap * trackLen + rc.distance,
        laps: rc.lap,
        replayId: 'r' + rc.connectionId,
      });
    });
    racers.push({
      name: this.playerCar.playerName?.trim() || this.parentRef?.user?.username || 'Player',
      playerId: this.parentRef?.user?.id || 0,
      isBot: false, isPlayer: true, color: '#ffffff',
      dist: this.currentLap * trackLen + this.carDist,
      laps: this.currentLap,
      replayId: 'replay-player',
    });
    racers.sort((a, b) => b.dist - a.dist);
    const dnfRows = this.dnfRacers.map(d => {
      let replayId: string | undefined;
      const rc = [...this.remoteCars.values()].find(v => v.playerName === d.name);
      if (rc) replayId = 'r' + rc.connectionId;
      const bot = this.bots.find(b => b.name === d.name);
      if (bot) replayId = bot.id;
      return {
        position: -1, name: d.name, playerId: d.playerId,
        isBot: !replayId || replayId.startsWith('b'), isPlayer: false, isDnf: true, isEstimated: false,
        color: d.color || '#9e9e9e', laps: 0, totalTimeMs: 0,
        replayId,
      };
    });
    this.finalStandings = [
      ...racers.map((r, i) => ({
        position: i + 1, name: r.name, playerId: r.playerId,
        isBot: r.isBot, isPlayer: r.isPlayer, isDnf: false,
        color: r.color,
        laps: Math.min(r.laps, this.totalLaps),
        totalTimeMs: r.isPlayer
          ? this._lastRaceTotalTime
          : this.estimateStandingsTime(r.dist, this._lastRaceTotalTime, playerDist),
        isEstimated: !r.isPlayer,
        replayId: r.replayId,
      })),
      ...dnfRows,
    ];
  }
  /** Project a racer's total race time from their covered distance relative to a
   *  reference racer with a known time over a known distance (t·(2 − d/dRef)):
   *  racers ahead of the reference finished earlier, racers behind are
   *  extrapolated to the line at the reference's average pace. */
  private estimateStandingsTime(dist: number, refTimeMs: number, refDist: number): number {
    if (!refTimeMs || refTimeMs <= 0 || !refDist || refDist <= 0 || !dist || dist <= 0) return 0;
    return Math.max(0, refTimeMs * (2 - dist / refDist));
  }
  /** Collapses/expands the standings panel (podium + lobby previous-race list). */
  toggleStandings(): void {
    this.standingsCollapsed = !this.standingsCollapsed;
  }
  /** Formatted total race time for a standings row — '—' for DNF or unfinished. */
  getStandingsTime(s: { totalTimeMs: number; isDnf: boolean; isEstimated?: boolean }): string {
    if (s.isDnf || !s.totalTimeMs || s.totalTimeMs <= 0) return '—';
    const time = this.formatTime(s.totalTimeMs);
    return s.isEstimated ? '~' + time : time;
  }
  /** Gap behind the race leader for a standings row ('+4.2s'), computed from
   *  the same total times as the Time column — '—' for the leader (or a tie),
   *  DNF rows, and racers without a recorded total. */
  getStandingsGap(s: { totalTimeMs: number; isDnf: boolean }): string {
    if (s.isDnf || !s.totalTimeMs || s.totalTimeMs <= 0) return '—';
    const leader = this.finalStandings.find(f => !f.isDnf && f.totalTimeMs > 0);
    if (!leader) return '—';
    const gapMs = s.totalTimeMs - leader.totalTimeMs;
    if (gapMs <= 0.5) return '—';
    return '+' + (gapMs / 1000).toFixed(1) + 's';
  }
  openStandingsProfile(s: { playerId: number; name: string; isBot: boolean }): void {
    if (!s || s.isBot || s.playerId <= 0) return;
    this.openRacerProfile({
      position: 0, playerId: s.playerId, playerName: s.name,
      lapTime: 0, totalTime: 0, moneyEarned: 0, isBot: false,
    });
  }
  /** Points the replay cameras at the clicked standings racer instead of
   *  yourself. Falls back to the player when no replay is available or the
   *  row has no recorded car (server-only rows). */
  watchStandingsRacer(s: { name: string; replayId?: string; isBot: boolean; playerId: number }): void {
    if (!s || !s.replayId || !this.renderer || this._replayFrames.length < 2) return;
    this.replayFollowId = s.replayId;
    this.replayFollowName = s.name;
    // Close the standings panel so the replayed car is actually visible.
    if (!this.standingsCollapsed) this.standingsCollapsed = true;
    if (this.replayPaused) this.replayPaused = false;
  }
  /** Stops following a specific racer and goes back to your own car. */
  clearReplayFollow(): void {
    this.replayFollowId = null;
    this.replayFollowName = '';
  }
  /** True while a non-self racer is selected as the replay camera target. */
  get isFollowingRacer(): boolean {
    return !!this.replayFollowId && this.replayFollowId !== 'replay-player';
  }
  /** Rebuild the final standings from the server's authoritative classification
   *  once every multiplayer racer has finished. Player rows come from the hub
   *  (their reported positions already account for bots); bots fill the gaps at
   *  the unclaimed positions in their local order, so every client shows the
   *  exact same lobby-wide table. */
  /** Ticks the live standings countdown; self-stops when the window expires. */
  private updateStandingsCountdown(): void {
    const remaining = Math.max(0, this._standingsDeadline - Date.now());
    const secs = Math.ceil(remaining / 1000);
    this.standingsCountdownText = remaining > 0 ? `Results shown for 0:${String(secs).padStart(2, '0')}` : '';
    this.standingsProgress = this._standingsTotalMs > 0
      ? Math.max(0, Math.min(100, (remaining / this._standingsTotalMs) * 100))
      : 100;
    this.standingsLow = remaining > 0 && remaining <= 3000;
    if (this.standingsLow && secs !== this._lastStandingsTickSecond) {
      this._lastStandingsTickSecond = secs;
      if (secs > 0) {
        this.playCountdownTick(secs);
        this.standingsTickFlash = true;
        if (this._standingsFlashTimer) clearTimeout(this._standingsFlashTimer);
        this._standingsFlashTimer = setTimeout(() => {
          this.standingsTickFlash = false;
          this._standingsFlashTimer = null;
        }, 300);
      }
    }
    if (remaining <= 0) this.stopStandingsCountdown();
  }
  private stopStandingsCountdown(): void {
    if (this._standingsTimer !== null) {
      clearInterval(this._standingsTimer);
      this._standingsTimer = null;
    }
    if (this._standingsFlashTimer) {
      clearTimeout(this._standingsFlashTimer);
      this._standingsFlashTimer = null;
    }
    this.standingsProgress = 100;
    this.standingsLow = false;
    this.standingsTickFlash = false;
    this._lastStandingsTickSecond = -1;
  }
  private applyServerStandings(): void {
    const rows = this.serverStandings;
    if (!rows || rows.length === 0 || !this._mpLobbyTrackId) return;
    const palette = ['#e53935', '#4a9eff', '#4caf50', '#ffd600', '#9c27b0', '#ff9800', '#00bcd4', '#e91e63'];
    const myId = this.parentRef?.user?.id || 0;
    const trackLen = this.renderer.totalTrackDist;
    const finishers = rows.filter(r => !r.isDnf).sort((a, b) => a.position - b.position);
    const dnfs = rows.filter(r => r.isDnf);
    const claimed = new Set(finishers.map(p => p.position));
    const winnerRow = finishers[0];
    const winRc = winnerRow ? this.remoteCars.get(winnerRow.connectionId) : undefined;
    const winDist = winRc ? Math.max(1, winnerRow.laps * trackLen + winRc.distance) : 0;
    const winTime = winnerRow ? (winnerRow.totalTimeMs || 0) : 0;
    const inRace = this.gameState === 'racing' || this.gameState === 'finished';
    const bots = inRace ? this.bots.filter(b => b.alive).slice().sort((a, b) => b.raceDist - a.raceDist) : [];
    const total = bots.length + finishers.length;
    let botIdx = 0;
    const result: { position: number; name: string; playerId: number; isBot: boolean; isPlayer: boolean; isDnf: boolean; isEstimated: boolean; color: string; laps: number; totalTimeMs: number; replayId?: string }[] = [];
    for (let pos = 1; pos <= total; pos++) {
      const p = claimed.has(pos) ? finishers.find(x => x.position === pos) : undefined;
      if (p) {
        const rc = this.remoteCars.get(p.connectionId);
        const color = rc
          ? `rgb(${Math.round(rc.colorR * 255)}, ${Math.round(rc.colorG * 255)}, ${Math.round(rc.colorB * 255)})`
          : this.getPlayerColor(p.connectionId);
        result.push({
          position: pos, name: p.playerName, playerId: p.playerId,
          isBot: false, isPlayer: p.playerId > 0 && p.playerId === myId, isDnf: false, isEstimated: false,
          color, laps: Math.min(p.laps || 0, this.totalLaps),
          totalTimeMs: p.totalTimeMs || 0,
          replayId: 'r' + p.connectionId,
        });
      } else if (botIdx < bots.length) {
        const b = bots[botIdx++];
        result.push({
          position: pos, name: b.name, playerId: 0, isBot: true, isPlayer: false, isDnf: false, isEstimated: true,
          color: palette[b.color % palette.length],
          laps: Math.min(b.lap, this.totalLaps),
          totalTimeMs: winTime > 0 ? this.estimateStandingsTime(b.raceDist, winTime, winDist) : 0,
          replayId: b.id,
        });
      }
    }
    for (const p of finishers) {
      if (!result.some(r => !r.isBot && r.playerId === p.playerId && r.name === p.playerName)) {
        const rc = this.remoteCars.get(p.connectionId);
        result.push({
          position: result.length + 1, name: p.playerName, playerId: p.playerId,
          isBot: false, isPlayer: p.playerId > 0 && p.playerId === myId, isDnf: false, isEstimated: false,
          color: rc
            ? `rgb(${Math.round(rc.colorR * 255)}, ${Math.round(rc.colorG * 255)}, ${Math.round(rc.colorB * 255)})`
            : this.getPlayerColor(p.connectionId),
          laps: Math.min(p.laps || 0, this.totalLaps),
          totalTimeMs: p.totalTimeMs || 0,
          replayId: 'r' + p.connectionId,
        });
      }
    }
    for (const p of dnfs) {
      const rc = this.remoteCars.get(p.connectionId);
      result.push({
        position: -1, name: p.playerName, playerId: p.playerId,
        isBot: false, isPlayer: p.playerId > 0 && p.playerId === myId, isDnf: true, isEstimated: false,
        color: rc
          ? `rgb(${Math.round(rc.colorR * 255)}, ${Math.round(rc.colorG * 255)}, ${Math.round(rc.colorB * 255)})`
          : '#9e9e9e',
        laps: 0, totalTimeMs: 0,
        replayId: 'r' + p.connectionId,
      });
    }
    this.finalStandings = result;
  }
  private recordRankMovement() {
    const trackId = this.selectedTrack?.id ?? 1;
    const uid = this.parentRef?.user?.id ?? 0;
    if (!uid || this.leaderboardUserRank <= 0) return;
    const key = `gp_rank_${trackId}_${uid}`;
    let prev = 0;
    try {
      const raw = localStorage.getItem(key);
      prev = raw ? parseInt(raw, 10) || 0 : 0;
    } catch { }
    this.rankMovement = prev > 0 ? this.leaderboardUserRank - prev : 0;
    try {
      localStorage.setItem(key, String(this.leaderboardUserRank));
    } catch { }
  }
  getLeaderboardRankMovement(): string {
    const d = this.rankMovement;
    if (d === 0) return '';
    const dir = d < 0 ? '▲ up' : '▼ down';
    return `${dir} ${Math.abs(d)} since last race`;
  }
  async openRacerProfile(r: RaceResult) {
    if (!r || r.playerId <= 0 || r.isBot) return;
    this.racerProfile = { playerId: r.playerId, playerName: r.playerName, car: null, loading: true };
    const car = await this.racingService.getPlayerCar(r.playerId);
    if (this.racerProfile?.playerId === r.playerId) {
      this.racerProfile = { playerId: r.playerId, playerName: r.playerName, car, loading: false };
    }
  }
  closeRacerProfile() {
    this.racerProfile = null;
  }
  openFriendProfile(fr: { userId: number; playerName: string }): void {
    if (!fr || fr.userId <= 0) return;
    this.openRacerProfile({
      position: 0, playerId: fr.userId, playerName: fr.playerName,
      lapTime: 0, totalTime: 0, moneyEarned: 0, isBot: false,
    });
  }
  openFullRacerProfile() {
    const p = this.racerProfile;
    if (!p) return;
    this.parentRef?.createComponent('User', { userId: p.playerId });
    this.closeRacerProfile();
  }
  getRacerTrackLaps(): { trackId: number; name: string; flag: string; lap: number }[] {
    const car = this.racerProfile?.car;
    const bests = car?.bestLapsByTrack;
    if (!bests) return [];
    const out: { trackId: number; name: string; flag: string; lap: number }[] = [];
    for (const t of this.trackDefs) {
      const lap = bests[t.id];
      if (lap && lap > 0) out.push({ trackId: t.id, name: t.name, flag: this.getTrackFlag(t), lap });
    }
    return out;
  }
  async loadLeaderboard() {
    const trackId = this.selectedTrack?.id ?? 1;
    const uid = this.parentRef?.user?.id ?? 0;
    try {
      const data = await this.racingService.getLeaderboard(trackId, uid);
      this.leaderboard = data?.results ?? [];
      this.leaderboardTotal = data?.totalCount ?? this.leaderboard.length;
      this.leaderboardUserRank = data?.userRank ?? 0;
      this.leaderboardBestLap = data?.bestLap ?? 0;
    } catch {
      this.leaderboard = [];
      this.leaderboardTotal = 0;
      this.leaderboardUserRank = 0;
      this.leaderboardBestLap = 0;
    }
    if (uid && !this.leaderboard.some(r => r.playerId === uid)) {
      const myTrackBest = (this.playerCar.bestLapsByTrack && this.playerCar.bestLapsByTrack[trackId] > 0)
        ? this.playerCar.bestLapsByTrack[trackId] : 0;
      const mine: RaceResult = {
        position: this.leaderboard.length + 1,
        playerId: uid,
        playerName: this.playerCar.playerName?.trim() || this.parentRef?.user?.username || 'You',
        lapTime: myTrackBest > 0 ? myTrackBest : 0,
        totalTime: 0,
        moneyEarned: 0,
        isBot: false,
        trackId: trackId,
      };
      this.leaderboard.push(mine);
      if (this.leaderboardUserRank <= 0 && myTrackBest > 0) this.leaderboardUserRank = this.leaderboard.length;
    }
  }
  getLeaderboardMedal(): string {
    if (this.leaderboardUserRank === 1) return '🥇';
    if (this.leaderboardUserRank === 2) return '🥈';
    if (this.leaderboardUserRank === 3) return '🥉';
    return this.leaderboardUserRank > 0 ? '🎖️' : '🏁';
  }
  getLeaderboardStandingText(): string {
    const total = this.leaderboardTotal;
    const rank = this.leaderboardUserRank;
    if (rank > 0) {
      let text = `#${rank} of ${total} on this level`;
      const leader = this.leaderboardBestLap;
      const myBest = this.getTrackBestLap(this.selectedTrack?.id ?? 1);
      if (rank > 1 && leader > 0 && myBest > 0 && myBest > leader) {
        text += ` · ${this.formatLapGap(myBest - leader)} behind 1st`;
      }
      return text;
    }
    return total > 0 ? `No lap yet — ${total} racers on this level` : 'No laps recorded yet';
  }
  getLivePaceText(): string {
    const live = this.liveLapTime;
    if (live <= 0) return '';
    const leader = this.leaderboardBestLap;
    const myBest = this.getTrackBestLap(this.selectedTrack?.id ?? 1);
    const parts: string[] = [];
    if (leader > 0) {
      parts.push(live <= leader ? 'PACE' : `P${this.formatLapGap(live - leader)}`);
    }
    if (myBest > 0) {
      parts.push(`${this.formatLapGap(live - myBest)} vs best`);
    }
    return parts.length > 0 ? parts.join(' · ') : '';
  }
  getLivePaceAhead(): boolean {
    const live = this.liveLapTime;
    return live > 0 && this.leaderboardBestLap > 0 && live <= this.leaderboardBestLap;
  }
  async toggleLeaderboard() {
    this.showLeaderboard = !this.showLeaderboard;
    if (this.showLeaderboard) {
      this.parentRef?.showOverlay();
      await this.loadAllTrackLeaderboards();
    } else {
      this.parentRef?.closeOverlay();
    }
  }
  // Drop degenerate rows (missing lap or name — e.g. an older server that
  // serialized the leaderboard DTO as empty {} objects) and empty boards, so a
  // partially-populated payload never renders blank lines and never suppresses
  // the fallback data sources.
  private sanitizeTrackBoards(
    boards: {
      trackId: number; totalCount: number; bestLap: number;
      userLap: number; userRank: number; results: RaceResult[];
    }[]
  ): {
    trackId: number; totalCount: number; bestLap: number;
    userLap: number; userRank: number; results: RaceResult[];
  }[] {
    return boards
      .map(b => ({
        ...b,
        results: (b.results || []).filter(r => r.lapTime > 0 && r.playerName)
      }))
      .filter(b => b.results.length > 0 || b.userLap > 0);
  }
  async loadAllTrackLeaderboards() {
    const uid = this.parentRef?.user?.id ?? 0;
    this.allTracksLoading = true;
    try {
      // null means the endpoint returned an unexpected shape (e.g. a mock/test
      // backend with no leaderboard routes) — keep that around so the panel can
      // say data is unavailable instead of pretending no laps exist.
      const byTrack = await this.racingService.getAllTrackLeaderboards(uid);
      let boards = this.sanitizeTrackBoards(byTrack ? byTrack.tracks : []);
      // Fallback: if the by-track endpoint returns nothing (older deployed
      // server without it, or a query hiccup), build the per-circuit boards
      // from the per-track leaderboard endpoint so the panel always shows data.
      if (boards.length === 0) {
        const per = await Promise.all(this.trackDefs.map(async t => {
          try {
            const d = await this.racingService.getLeaderboard(t.id, uid);
            if (!d || d.results.length === 0) return null;
            const mine = d.results.find(r => r.playerId === uid);
            return {
              trackId: t.id,
              totalCount: d.totalCount,
              bestLap: d.bestLap,
              userLap: mine?.lapTime ?? 0,
              userRank: d.userRank,
              results: d.results,
            };
          } catch { return null; }
        }));
        boards = this.sanitizeTrackBoards(per.filter((b): b is NonNullable<typeof b> => b !== null));
      }
      // Last-resort fallback: the aggregate endpoints are unavailable, but the
      // player's own per-track bests (from /car) are still worth showing — at
      // minimum the panel reflects their own recorded laps on each circuit.
      if (boards.length === 0 && this.playerCar?.bestLapsByTrack) {
        const myLaps = this.playerCar.bestLapsByTrack;
        const seeded: {
          trackId: number; totalCount: number; bestLap: number;
          userLap: number; userRank: number; results: RaceResult[];
        }[] = [];
        for (const t of this.trackDefs) {
          const lap = myLaps[t.id];
          if (lap && lap > 0) {
            seeded.push({
              trackId: t.id,
              totalCount: 1,
              bestLap: lap,
              userLap: lap,
              userRank: 1,
              results: [{
                playerId: uid,
                playerName: this.parentRef?.user?.username ?? 'You',
                lapTime: lap,
                isBot: false,
              } as RaceResult],
            });
          }
        }
        boards = seeded;
      }					// Honest state: when the by-track route failed outright (null), the
					// own-laps fallback above still seeds boards — surface the notice
					// alongside them instead of silently pretending the user's laps are
					// the whole field. When it answered with rows but every one was
					// unsanitizable (e.g. an older server that serialized the DTO as empty
					// objects), also say data is unavailable rather than 'no laps yet'.
					this.leaderboardDataUnavailable = byTrack === null ||
						(boards.length === 0 && (byTrack.tracks?.length ?? 0) > 0);
      this.allTrackBoards = boards;
      // On small screens default every card to collapsed so the panel stays
      // compact; users can expand individual circuits as needed. Only seed the
      // collapsed set once so revisiting the view doesn't wipe manual expansions.
      if (window.innerWidth < 768 && this.collapsedTrackBoards.size === 0) {
        this.collapsedTrackBoards = new Set(this.allTrackBoards.map(b => b.trackId));
      }
      // Keep the in-race HUD pace readout fed: the alltracks payload already
      // carries each circuit's leader lap, so mirror it into leaderboardBestLap
      // for the currently selected track (loadLeaderboard may never run now
      // that All Circuits is the opening view).
      const tid = this.selectedTrack?.id ?? 1;
      const leader = this.getTrackBoardBest(tid);
      if (leader > 0) this.leaderboardBestLap = leader;
    } catch {
      // The load failed outright — surface the unavailable notice rather than
      // implying the circuits have no laps.
      this.allTrackBoards = [];
      this.leaderboardDataUnavailable = true;
    } finally {
      this.allTracksLoading = false;
    }
  }
  getTrackBoard(trackId: number) {
    return this.allTrackBoards.find(b => b.trackId === trackId);
  }
  getTrackBoardRows(trackId: number): RaceResult[] {
    return this.getTrackBoard(trackId)?.results ?? [];
  }
  getTrackBoardVisibleRows(trackId: number): RaceResult[] {
    const rows = this.getTrackBoardRows(trackId);
    return this.trackBoardShowTop20.has(trackId) ? rows : rows.slice(0, 10);
  }
  isTrackBoardCollapsed(trackId: number): boolean {
    return this.collapsedTrackBoards.has(trackId);
  }
  toggleTrackBoard(trackId: number) {
    if (this.collapsedTrackBoards.has(trackId)) this.collapsedTrackBoards.delete(trackId);
    else this.collapsedTrackBoards.add(trackId);
  }
  toggleTrackBoardTop20(trackId: number) {
    if (this.trackBoardShowTop20.has(trackId)) this.trackBoardShowTop20.delete(trackId);
    else this.trackBoardShowTop20.add(trackId);
  }
  getFilteredTrackDefs(): TrackDefinition[] {
    const q = this.trackSearch.trim().toLowerCase();
    if (!q) return this.trackDefs;
    return this.trackDefs.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.id.toString().includes(q) ||
      this.getTrackFlag(t).toLowerCase().includes(q)
    );
  }
  onTrackSearchChange(event?: any) {
    const value = event ? event.target?.value : '';
    const wasEmpty = !this.trackSearch.trim();
    const isNowEmpty = !value.trim();
    this.trackSearch = value;
    if (isNowEmpty && this.preSearchCollapsed) {
      // Search cleared — restore the collapse state from before searching so the
      // compact layout (e.g. mobile default-collapsed) isn't lost.
      this.collapsedTrackBoards = new Set(this.preSearchCollapsed);
      this.preSearchCollapsed = null;
      return;
    }
    if (wasEmpty && !isNowEmpty) {
      // First non-empty query — snapshot the current collapse state.
      this.preSearchCollapsed = new Set(this.collapsedTrackBoards);
    }
    // Expanding matches makes the search visibly 'jump' to the circuit.
    for (const t of this.getFilteredTrackDefs()) {
      if (this.collapsedTrackBoards.has(t.id)) this.collapsedTrackBoards.delete(t.id);
    }
  }
  getTrackBoardCount(trackId: number): number {
    return this.getTrackBoard(trackId)?.totalCount ?? 0;
  }
  getTrackBoardBest(trackId: number): number {
    return this.getTrackBoard(trackId)?.bestLap ?? 0;
  }
  getTrackBoardUserLap(trackId: number): number {
    return this.getTrackBoard(trackId)?.userLap ?? 0;
  }
  getTrackBoardUserRank(trackId: number): number {
    return this.getTrackBoard(trackId)?.userRank ?? 0;
  }
  getTrackBoardGap(r: RaceResult, trackId: number): string {
    const leader = this.getTrackBoardBest(trackId);
    if (leader > 0 && r.lapTime > 0) {
      return r.lapTime <= leader ? 'PACE' : this.formatLapGap(r.lapTime - leader);
    }
    return '';
  }
  getLeaderboardRaceName(r: RaceResult): string {
    const track = this.trackDefs.find(t => t.id === r.trackId) || this.selectedTrack;
    return track ? `${this.getTrackFlag(track)} ${track.name}` : 'Race';
  }
  async saveCar() {
    await this.racingService.savePlayerCar(this.playerCar);
  }
  playerNameDraft = '';
  onPlayerNameInput(value: string) {
    this.playerNameDraft = value;
  }
  async savePlayerName() {
    const name = this.playerNameDraft.trim().slice(0, 40);
    this.playerNameDraft = name;
    if (name === (this.playerCar.playerName || '')) return;
    this.playerCar.playerName = name || this.parentRef?.user?.username || '';
    await this.saveCar();
    this.addMessage(this.playerCar.playerName ? `Racer name set to ${this.playerCar.playerName}!` : 'Racer name cleared');
  }
  getUpgradesForCategory(cat: string): any[] {
    return UPGRADE_DEFS.filter(u => u.category === cat);
  }
  getUpgradeLevel(cat: string): number {
    const ups = this.playerCar.upgrades.filter(u => u.category === cat);
    return ups.length > 0 ? Math.max(...ups.map(u => u.level)) : 0;
  }
  canAffordUpgrade(u: any): boolean {
    return this.playerCar.money >= u.cost && this.getUpgradeLevel(u.category) + 1 === u.level;
  }
  isBuying = false;
  buyingUpgradeId: number | null = null;
  async buyUpgrade(u: any) {
    if (this.isBuying || !this.canAffordUpgrade(u)) return;
    const userId = this.parentRef?.user?.id ?? 0;
    if (!userId) return;
    this.isBuying = true;
    this.buyingUpgradeId = u.id;
    try {
      const result = await this.racingService.buyUpgrade(userId, u.id);
      if (result) {
        this.playerCar = result;
        this.invalidateUpgradeStats();
        this.addMessage(`Upgraded: ${u.name}!`);
      } else {
        this.addMessage(`Couldn't buy ${u.name} — purchase rejected.`);
        await this.refreshPlayerCarFromServer();
      }
    } finally {
      this.isBuying = false;
      this.buyingUpgradeId = null;
    }
  }
  async selectSkin(skin: any) {
    if (this.isBuying) return;
    const userId = this.parentRef?.user?.id ?? 0;
    if (!userId) return;
    if (!skin.owned) {
      this.isBuying = true;
      try {
        const result = await this.racingService.buySkin(userId, skin.id);
        if (result) {
          this.playerCar = result;
          this.invalidateUpgradeStats();
          skin.owned = true;
        } else {
          this.addMessage(`Couldn't buy ${skin.name} — not enough money.`);
          await this.refreshPlayerCarFromServer();
          return;
        }
      } finally {
        this.isBuying = false;
      }
    }
    this.playerCar.skinId = skin.id;
    this.invalidateUpgradeStats();
    this.saveCar();
    this.addMessage(`Skin changed to: ${skin.name}!`);
  }
  getAppearanceParts(): RacingAppearancePart[] { return APPEARANCE_PARTS; }
  getAppearanceCategories(): { key: string; label: string; parts: RacingAppearancePart[] }[] {
    return [
      { key: 'spoiler', label: 'SPOILERS', parts: APPEARANCE_PARTS.filter(p => p.category === 'spoiler') },
      { key: 'rims', label: 'RIMS', parts: APPEARANCE_PARTS.filter(p => p.category === 'rims') },
      { key: 'exhaust', label: 'EXHAUST', parts: APPEARANCE_PARTS.filter(p => p.category === 'exhaust') },
      { key: 'decal', label: 'DECALS & WRAPS', parts: APPEARANCE_PARTS.filter(p => p.category === 'decal') },
      { key: 'glow', label: 'NEON UNDERGLOW', parts: APPEARANCE_PARTS.filter(p => p.category === 'glow') },
      { key: 'accent', label: 'LIVERY ACCENT', parts: APPEARANCE_PARTS.filter(p => p.category === 'accent') },
    ];
  }
  getAppearancePreviewClass(p: RacingAppearancePart): string {
    const previews: Record<number, string> = {
      101: 'prev-spoiler-carbon', 102: 'prev-spoiler-dual', 103: 'prev-spoiler-drs',
      104: 'prev-spoiler-gurney', 105: 'prev-spoiler-whale', 106: 'prev-spoiler-biplane', 107: 'prev-spoiler-aero',
      201: 'prev-rim-alloy', 202: 'prev-rim-deep', 203: 'prev-rim-gold',
      204: 'prev-rim-chrome', 205: 'prev-rim-bronze', 206: 'prev-rim-white', 207: 'prev-rim-black', 208: 'prev-rim-blue',
      209: 'prev-rim-emerald', 210: 'prev-rim-violet', 211: 'prev-rim-crimson', 212: 'prev-rim-sunset',
      213: 'prev-rim-copper', 214: 'prev-rim-teal', 215: 'prev-rim-whitegold', 216: 'prev-rim-mattegrey',
      301: 'prev-exhaust-sport', 302: 'prev-exhaust-titanium', 303: 'prev-exhaust-twin', 304: 'prev-exhaust-quad', 305: 'prev-exhaust-carbon',
      // Decals (401-428) render the top-down placement map instead of a swatch.
      501: 'prev-glow-blue', 502: 'prev-glow-green', 503: 'prev-glow-purple', 504: 'prev-glow-pink',
      505: 'prev-glow-cyan', 506: 'prev-glow-red', 507: 'prev-glow-gold',
      508: 'prev-glow-orange', 509: 'prev-glow-white', 510: 'prev-glow-uv', 511: 'prev-glow-lime',
      512: 'prev-glow-teal', 513: 'prev-glow-magenta', 514: 'prev-glow-yellow', 515: 'prev-glow-cobalt',
      516: 'prev-glow-emerald', 517: 'prev-glow-crimson', 518: 'prev-glow-mint', 519: 'prev-glow-orchid',
      520: 'prev-glow-ice', 521: 'prev-glow-bronze', 522: 'prev-glow-indigo', 523: 'prev-glow-silver',
      524: 'prev-glow-copper', 525: 'prev-glow-teal', 526: 'prev-glow-burgundy', 527: 'prev-glow-navy',
      528: 'prev-glow-mint', 529: 'prev-glow-coral', 530: 'prev-glow-champagne', 531: 'prev-glow-gunmetal',
      601: 'prev-accent-white', 602: 'prev-accent-gold', 603: 'prev-accent-silver', 604: 'prev-accent-red',
      605: 'prev-accent-blue', 606: 'prev-accent-black',
      607: 'prev-accent-green', 608: 'prev-accent-orange', 609: 'prev-accent-purple', 610: 'prev-accent-pink',
      611: 'prev-accent-cyan', 612: 'prev-accent-lime',
      613: 'prev-accent-copper', 614: 'prev-accent-teal', 615: 'prev-accent-burgundy', 616: 'prev-accent-navy',
      617: 'prev-accent-mint', 618: 'prev-accent-coral', 619: 'prev-accent-champagne', 620: 'prev-accent-gunmetal',
    };
    return previews[p.id] ?? '';
  }
  /** True for decal parts — they get a top-down placement map instead of a swatch. */
  isDecalPart(p: RacingAppearancePart): boolean {
    return p.category === 'decal';
  }
  private _decalColorCache = new Map<number, string>();
  /** Decal colour as an rgb() string for the placement map plates, floored so dark wraps stay visible on the silhouette. */
  getDecalPlateColor(id: number): string {
    const cached = this._decalColorCache.get(id);
    if (cached) return cached;
    const c = DECAL_COLORS[id];
    const to255 = (v: number) => Math.max(52, Math.round(v * 255));
    const col = c ? `rgb(${to255(c[0])}, ${to255(c[1])}, ${to255(c[2])})` : '#888';
    this._decalColorCache.set(id, col);
    return col;
  }
  /**
   * Top-down placement rects for a decal card, derived from DECAL_LAYOUTS so the
   * preview shows exactly where the artwork lands on the car (front is +x, nose
   * points right). Returns percentage strings ready for [ngStyle].
   */
  private _decalRectCache = new Map<number, { left: string; top: string; width: string; height: string }[]>();
  getDecalPlateRects(p: RacingAppearancePart): { left: string; top: string; width: string; height: string }[] {
    const cached = this._decalRectCache.get(p.id);
    if (cached) return cached;
    const layout = DECAL_LAYOUTS[p.id];
    if (!layout) return [];
    const xMin = -1.5, xMax = 1.5, zMin = -0.62, zMax = 0.62;
    const xSpan = xMax - xMin, zSpan = zMax - zMin;
    const rects: { left: string; top: string; width: string; height: string }[] = [];
    const push = (cx: number, cz: number, l: number, d: number) => {
      rects.push({
        left: `${((cx - l / 2 - xMin) / xSpan) * 100}%`,
        width: `${(l / xSpan) * 100}%`,
        top: `${((cz - d / 2 - zMin) / zSpan) * 100}%`,
        height: `${(d / zSpan) * 100}%`,
      });
    };
    for (const [cx, , l, , d, z] of layout.flank) {
      push(cx, z, l, d);
      push(cx, -z, l, d);
    }
    for (const [cx, , l, , d] of layout.center) {
      push(cx, 0, l, d);
    }
    this._decalRectCache.set(p.id, rects);
    return rects;
  }
  private _accentRectCache = new Map<number, { left: string; top: string; width: string; height: string }[]>();
  /**
   * Top-down rects for the accent side-pod stripes that survive alongside this
   * decal style, drawn from the SAME getAccentSegsForStyle() filter the 3D car
   * uses — so the card previews the exact combined accent + decal livery.
   * Mirrors each segment to ±z like the mesh does.
   */
  getAccentPlateRects(p: RacingAppearancePart): { left: string; top: string; width: string; height: string }[] {
    const cached = this._accentRectCache.get(p.id);
    if (cached) return cached;
    const segs = getAccentSegsForStyle(p.id);
    const xMin = -1.5, xMax = 1.5, zMin = -0.62, zMax = 0.62;
    const xSpan = xMax - xMin, zSpan = zMax - zMin;
    const rects: { left: string; top: string; width: string; height: string }[] = [];
    const push = (cx: number, cz: number, l: number, d: number) => {
      rects.push({
        left: `${((cx - l / 2 - xMin) / xSpan) * 100}%`,
        width: `${(l / xSpan) * 100}%`,
        top: `${((cz - d / 2 - zMin) / zSpan) * 100}%`,
        height: `${(d / zSpan) * 100}%`,
      });
    };
    for (const [cx, , l, , d, z] of segs) {
      push(cx, z, l, d);
      push(cx, -z, l, d);
    }
    this._accentRectCache.set(p.id, rects);
    return rects;
  }
  private _accentColorCache = new Map<number, string>();
  /** Accent stripe colour for the map — the player's equipped accent tint, so
   *  the preview shows their actual accent; floors dark accents so they stay
   *  visible against the silhouette. */
  getAccentPlateColor(accentId: number): string {
    const cached = this._accentColorCache.get(accentId);
    if (cached) return cached;
    const c = ACCENT_COLORS[accentId];
    const to255 = (v: number) => Math.max(52, Math.round(v * 255));
    const col = c ? `rgb(${to255(c[0])}, ${to255(c[1])}, ${to255(c[2])})` : '#9aa0aa';
    this._accentColorCache.set(accentId, col);
    return col;
  }
  private _accentFitCache = new Map<number, { clean: boolean; kept: number; total: number; text: string }>();
  /**
   * 'Fits with' note for a decal card. All accent styles share one pod-stripe
   * layout (only the colour differs via ACCENT_COLORS), so the fit verdict is
   * decal-determined: a decal either keeps all 5 accent stripes (pairs cleanly
   * with every one of the 12 accents) or hides some. The count comes from the
   * SAME getAccentSegsForStyle() filter the 3D car and the card's map use, so
   * the note always matches what the player will actually see.
   */
  getAccentFitNote(p: RacingAppearancePart): { clean: boolean; kept: number; total: number; text: string } {
    const cached = this._accentFitCache.get(p.id);
    if (cached) return cached;
    const total = 5;
    const kept = getAccentSegsForStyle(p.id).length;
    const clean = kept === total;
    const accentCount = APPEARANCE_PARTS.filter(a => a.category === 'accent').length;
    const note = clean
      ? { clean, kept, total, text: `Fits with all ${accentCount} accent styles` }
      : kept === 0
        ? { clean, kept, total, text: 'Covers every accent stripe' }
        : { clean, kept, total, text: `Hides ${total - kept}/${total} accent stripes with any accent` };
    this._accentFitCache.set(p.id, note);
    return note;
  }
  getEquippedAppearance(cat: string): number {
    switch (cat) {
      case 'spoiler': return this.playerCar.spoilerId;
      case 'rims': return this.playerCar.rimId;
      case 'exhaust': return this.playerCar.exhaustId;
      case 'decal': return this.playerCar.decalId;
      case 'glow': return this.playerCar.glowId;
      case 'accent': return this.playerCar.accentId;
      default: return 0;
    }
  }
  isAppearanceOwned(part: RacingAppearancePart): boolean {
    return part.owned || this.getEquippedAppearance(part.category) === part.id;
  }
  /** Equipped id for a category, or the hovered part's id while it is being
   *  previewed — lets the car render an upgrade before it is bought. */
  previewOrEquipped(cat: string): number {
    if (this.appearancePreview && this.appearancePreview.category === cat) return this.appearancePreview.id;
    return this.getEquippedAppearance(cat);
  }
  async buyAppearancePart(part: RacingAppearancePart) {
    if (this.isBuying) return;
    if (this.playerCar.money < part.cost) {
      this.addMessage(`Not enough money for ${part.name} — need $${part.cost.toLocaleString()}.`);
      return;
    }
    if (this.isAppearanceOwned(part)) {
      this.equipAppearance(part);
      this.saveCar();
      return;
    }
    this.isBuying = true;
    try {
      this.playerCar.money -= part.cost;
      part.owned = true;
      this.equipAppearance(part);
      await this.saveCar();
      this.addMessage(`${part.name} installed!`);
    } finally {
      this.isBuying = false;
    }
  }
  private equipAppearance(part: RacingAppearancePart) {
    switch (part.category) {
      case 'spoiler': this.playerCar.spoilerId = part.id; break;
      case 'rims': this.playerCar.rimId = part.id; break;
      case 'exhaust': this.playerCar.exhaustId = part.id; break;
      case 'decal': this.playerCar.decalId = part.id; break;
      case 'glow': this.playerCar.glowId = part.id; break;
      case 'accent': this.playerCar.accentId = part.id; break;
    }
    this.invalidateUpgradeStats();
  }
  getSpoilerStyle(): string {
    const id = this.previewOrEquipped('spoiler');
    if (id === 101) return 'spoiler-carbon';
    if (id === 102) return 'spoiler-dual';
    if (id === 103) return 'spoiler-drs';
    if (id === 104) return 'spoiler-gurney';
    if (id === 105) return 'spoiler-whale';
    if (id === 106) return 'spoiler-biplane';
    if (id === 107) return 'spoiler-aero';
    return '';
  }
  getRimStyle(): string {
    const id = this.previewOrEquipped('rims');
    if (id === 201) return 'rim-alloy';
    if (id === 202) return 'rim-deep';
    if (id === 203) return 'rim-gold';
    if (id === 204) return 'rim-chrome';
    if (id === 205) return 'rim-bronze';
    if (id === 206) return 'rim-white';
    if (id === 207) return 'rim-black';
    if (id === 208) return 'rim-blue';
    return '';
  }
  getExhaustStyle(): string {
    const id = this.previewOrEquipped('exhaust');
    if (id === 301) return 'exhaust-sport';
    if (id === 302) return 'exhaust-titanium';
    if (id === 303) return 'exhaust-twin';
    if (id === 304) return 'exhaust-quad';
    if (id === 305) return 'exhaust-carbon';
    return '';
  }
  getDecalStyle(): string {
    const id = this.previewOrEquipped('decal');
    if (id === 401) return 'decal-stripes';
    if (id === 402) return 'decal-flame';
    if (id === 403) return 'decal-carbon';
    if (id === 404) return 'decal-number';
    if (id === 405) return 'decal-checkered';
    if (id === 406) return 'decal-lightning';
    if (id === 407) return 'decal-skull';
    if (id === 408) return 'decal-lion';
    if (id === 409) return 'decal-number7';
    if (id === 410) return 'decal-number27';
    if (id === 411) return 'decal-number99';
    if (id === 412) return 'decal-sponsor';
    if (id === 413) return 'decal-camo';
    if (id === 414) return 'decal-cheetah';
    if (id === 415) return 'decal-rising-sun';
    if (id === 416) return 'decal-circuit';
    if (id === 417) return 'decal-bullseye';
    if (id === 418) return 'decal-union';
    if (id === 419) return 'decal-grid';
    if (id === 420) return 'decal-kanji';
    if (id === 421) return 'decal-dragon';
    if (id === 422) return 'decal-bee';
    if (id === 423) return 'decal-tiger';
    if (id === 424) return 'decal-starburst';
    if (id === 425) return 'decal-heart';
    if (id === 426) return 'decal-arrow';
    if (id === 427) return 'decal-wave';
    if (id === 428) return 'decal-moon';
    return '';
  }
  getGlowStyle(): string {
    const id = this.previewOrEquipped('glow');
    if (id === 501) return 'glow-blue';
    if (id === 502) return 'glow-green';
    if (id === 503) return 'glow-purple';
    if (id === 504) return 'glow-pink';
    if (id === 505) return 'glow-cyan';
    if (id === 506) return 'glow-red';
    if (id === 507) return 'glow-gold';
    if (id === 508) return 'glow-orange';
    if (id === 509) return 'glow-white';
    if (id === 510) return 'glow-uv';
    if (id === 511) return 'glow-lime';
    if (id === 512) return 'glow-teal';
    if (id === 513) return 'glow-magenta';
    if (id === 514) return 'glow-yellow';
    if (id === 515) return 'glow-cobalt';
    if (id === 516) return 'glow-emerald';
    if (id === 517) return 'glow-crimson';
    if (id === 518) return 'glow-mint';
    if (id === 519) return 'glow-orchid';
    if (id === 520) return 'glow-ice';
    if (id === 521) return 'glow-bronze';
    if (id === 522) return 'glow-indigo';
    if (id === 523) return 'glow-silver';
    return '';
  }
  getAccentStyle(): string {
    const id = this.previewOrEquipped('accent');
    if (id === 601) return 'accent-white';
    if (id === 602) return 'accent-gold';
    if (id === 603) return 'accent-silver';
    if (id === 604) return 'accent-red';
    if (id === 605) return 'accent-blue';
    if (id === 606) return 'accent-black';
    return '';
  }
  private hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const n = parseInt(full, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  /** Slot accessor — lazily grows the car-slot pool (bots + remotes + player). */
  private carSlotAt(i: number): CarListSlot {
    let s = this._carSlots[i];
    if (!s) {
      s = { x: 0, y: 0, z: 0, yaw: 0, r: 0, g: 0, b: 0, speed: 0, accel: 0, spin: 0, slide: 0, id: '', bank: 0 };
      this._carSlots[i] = s;
    }
    return s;
  }
  /** Same computation as botAppearanceFor but writes into a reused slot — no
   *  intermediate object. Runs for every bot/remote car on every frame. */
  private fillBotAppearance(slot: CarListSlot, i: number, seed: number) {
    // Uses the module-level hoisted id arrays — never Object.keys here, this
    // runs for every bot/remote/replay car on every frame.
    const hash = (i * 7 + seed * 13) & 0xffff;
    slot.rimStyle = RIM_TINT_IDS[(hash + i) % RIM_TINT_IDS.length];
    slot.decalStyle = DECAL_COLOR_IDS[(hash * 3 + i) % DECAL_COLOR_IDS.length];
    slot.accent = ACCENT_COLORS[ACCENT_COLOR_IDS[(hash + i * 2) % ACCENT_COLOR_IDS.length]];
    slot.glow = (hash + i) % 5 === 0 ? GLOW_COLORS[GLOW_COLOR_IDS[(hash + i) % GLOW_COLOR_IDS.length]] : undefined;
    slot.glowIntensity = 30 + ((hash + i * 17) % 5) * 15;
    slot.metallic = 0.3 + ((hash + i * 3) % 6) / 10;
    // Bots/remotes never carry these player-only fields — clear them so a slot
    // reused from a previous frame (e.g. the countdown player car) can't leak
    // the player's spoiler/exhaust/paint onto an NPC.
    slot.spoilerId = undefined;
    slot.exhaustId = undefined;
    slot.skin = undefined;
  }
  private botAppearanceFor(i: number, seed: number): RacingCarAppearance {
    const s: CarListSlot = { x: 0, y: 0, z: 0, yaw: 0, r: 0, g: 0, b: 0, speed: 0, accel: 0, spin: 0, slide: 0, id: '', bank: 0 };
    this.fillBotAppearance(s, i, seed);
    return s;
  }
  /** Stable per-connectionId appearance seed, computed once and cached — the
   *  connectionId never changes, so the split/reduce only runs on first use
   *  instead of every frame per remote car. */
  private remoteSeed(connectionId: string): number {
    let s = this._remoteSeedCache.get(connectionId);
    if (s === undefined) {
      s = connectionId.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0);
      this._remoteSeedCache.set(connectionId, s);
    }
    return s;
  }
  private lerpAngle(a: number, b: number, t: number): number {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }
  /** Total recorded replay length (ms) — the last frame's timestamp. */
  get replayDuration(): number {
    const frames = this._replayFrames;
    return frames.length > 1 ? frames.last().t : 0;
  }
  onReplayScrubStart(e: PointerEvent) {
    this._replayDragging = true;
    this.seekReplayTo(e);
    try { (e.currentTarget as HTMLElement)?.setPointerCapture?.(e.pointerId); } catch { }
  }
  onReplayScrubMove(e: PointerEvent) {
    if (this._replayDragging) this.seekReplayTo(e);
  }
  onReplayScrubEnd() {
    this._replayDragging = false;
  }
  private seekReplayTo(e: PointerEvent) {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const frac = rect.width > 0 ? Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) : 0;
    this._replayTime = frac * this.replayDuration;
    this._replaySpins.clear();
    this.syncReplayTimeline();
  }
  get replayKnobLeft(): number {
    return Math.max(0.6, Math.min(99.4, this.replayProgressPct));
  }
  get replayScrubIcon(): string {
    if (this.replayScrubDir < 0) return '⏪';
    if (this.replayScrubDir > 0) return '⏩';
    return this.replayPaused ? '⏸' : '▶';
  }
  private syncReplayTimeline() {
    if (this.replayDuration <= 0) {
      this.stopReplayUiTimer();
      return;
    }
    this.replayDurationLabel = this.formatTime(this.replayDuration);
    this.replayTimeLabel = this._replayTime > 0 ? this.formatTime(this._replayTime) : '0:00.0';
    this.replayProgressPct = Math.max(0, Math.min(100, (this._replayTime / this.replayDuration) * 100));
  }
  private stopReplayUiTimer() {
    if (this._replayUiTimer) { clearInterval(this._replayUiTimer); this._replayUiTimer = null; }
  }
  private renderReplay(dt: number) {
    const frames = this._replayFrames;
    if (frames.length < 2 || !this.renderer || !this.isLoaded) return;
    if (!this._replayUiTimer) {
      this.ngZone.run(() => {
        this._replayUiTimer = window.setInterval(() => this.syncReplayTimeline(), 250);
      });
    }
    const canvas = this.canvasRef.nativeElement;
    const aspect = canvas.width / canvas.height;
    const last = frames.last();
    const keyDir = (this.keys.has('ArrowLeft') ? -1 : 0) + (this.keys.has('ArrowRight') ? 1 : 0);
    this.replayScrubDir = keyDir;
    if (this._replayDragging) {
    } else if (keyDir !== 0) {
      this._replayTime += dt * 1000 * RacingComponent.REPLAY_SCRUB_RATE * keyDir;
      if (this._replayTime < 0) this._replayTime = 0;
      if (this._replayTime > last.t) this._replayTime = last.t;
    } else if (this.replayPaused) {
    } else {
      this._replayTime += dt * 1000;
      if (this._replayTime > last.t) {
        this._replayTime = 0;
        this._replaySpins.clear();
        // NOTE: _replayAppearances is intentionally NOT cleared here — the record
        // loop only runs during racing, so wiping it at the replay wrap-around would
        // make bots fall back to re-seeded looks on the second playback loop.
        this._replayTrailArmed = false;
      }
    }
    const timeDir = keyDir !== 0 ? Math.sign(keyDir) : (this.replayPaused ? 0 : 1);
    let i = 0;
    while (i < frames.length - 2 && frames.at(i + 1).t < this._replayTime) i++;
    const a = frames.at(i);
    const b = frames.at(i + 1);
    const frac = Math.min(1, Math.max(0, (this._replayTime - a.t) / Math.max(0.001, b.t - a.t)));
    const lerp = (x: number, y: number) => x + (y - x) * frac;
    const px = lerp(a.px, b.px);
    const pz = lerp(a.pz, b.pz);
    const pyaw = this.lerpAngle(a.pyaw, b.pyaw, frac);
    const pspd = lerp(a.pspd, b.pspd);
    const pacc = lerp(a.pacc, b.pacc);
    const pslid = lerp(a.pslid, b.pslid);
    const grid = new Map<string, ReplayCar>();
    for (const c of a.cars) grid.set(c.id, c);
    for (const c of b.cars) {
      const prev = grid.get(c.id);
      grid.set(c.id, prev
        ? { ...prev, x: lerp(prev.x, c.x), z: lerp(prev.z, c.z), yaw: this.lerpAngle(prev.yaw, c.yaw, frac), speed: lerp(prev.speed, c.speed), accel: lerp(prev.accel, c.accel), slide: lerp(prev.slide, c.slide), dist: lerp(prev.dist, c.dist), name: c.name }
        : c);
    }
    const pdist = lerp(a.pdist, b.pdist);
    // Replay cameras and cars ride the same terrain as the live race.
    const pa = this.getPlayerAppearance();
    const skin = pa.skin ?? [0.85, 0.06, 0.06];
    grid.set('replay-player', { x: px, z: pz, yaw: pyaw, speed: pspd, accel: pacc, slide: pslid, id: 'replay-player', r: skin[0], g: skin[1], b: skin[2], dist: pdist, name: this.myLobbyName });
    let leadId = 'replay-player';
    let leadDist = pdist;
    grid.forEach((c, id) => {
      if (c.dist > leadDist) { leadDist = c.dist; leadId = id; }
    });
    const leader = grid.get(leadId);
    const lx = leader ? leader.x : px;
    const lz = leader ? leader.z : pz;
    const lElev = this.renderer.getTrackElevation(leadDist);
    this.replayLeadName = leader && leader.name ? leader.name : this.myLobbyName;
    const camIdx = Math.floor(this._replayTime / RacingComponent.REPLAY_CAM_MS) % 4;
    this.replayCam = camIdx;
    let eyeX: number, eyeY: number, eyeZ: number, camYaw: number, camPitch: number;
    // Follow target from the standings: the selected racer's interpolated
    // frame position, or the player when nothing is selected / not found.
    const followCar = this.replayFollowId && this.replayFollowId !== 'replay-player'
      ? (grid.get(this.replayFollowId) ?? null)
      : null;
    const fx = followCar ? followCar.x : px;
    const fz = followCar ? followCar.z : pz;
    const fyaw = followCar ? followCar.yaw : pyaw;
    const fspd = followCar ? followCar.speed : pspd;
    const fdist = followCar ? followCar.dist : pdist;
    const fElev = this.renderer.getTrackElevation(fdist);
    const ffwdX = Math.sin(fyaw), ffwdZ = Math.cos(fyaw);
    if (camIdx === 1) {
      const sideX = Math.cos(fyaw), sideZ = -Math.sin(fyaw);
      const speedF = Math.min(1, Math.abs(fspd) / this.getMaxSpeed());
      const sway = Math.sin(this._replayTime * 0.0022) * (0.25 + speedF * 0.65);
      const bob = Math.sin(this._replayTime * 0.0031) * 0.22;
      eyeX = fx - ffwdX * 7.5 + sideX * (2.4 + sway);
      eyeZ = fz - ffwdZ * 7.5 + sideZ * (2.4 + sway);
      eyeY = fElev + 1.55 + bob + Math.abs(fspd) * 0.012;
      const tx = fx + ffwdX * 5, tz = fz + ffwdZ * 5;
      camYaw = Math.atan2(tx - eyeX, tz - eyeZ);
      camPitch = Math.atan2(eyeY - (fElev + 0.85), Math.hypot(tx - eyeX, tz - eyeZ));
    } else if (camIdx === 2) {
      const ang = this._replayTime * 0.00022;
      eyeX = fx + Math.cos(ang) * 13;
      eyeZ = fz + Math.sin(ang) * 13;
      eyeY = fElev + 15 + Math.sin(this._replayTime * 0.0004) * 2;
      const toX = fx - eyeX, toZ = fz - eyeZ;
      camYaw = Math.atan2(toX, toZ);
      camPitch = Math.atan2(eyeY - (fElev + 0.6), Math.hypot(toX, toZ));
    } else if (camIdx === 3) {
      const orbit = this._replayTime * 0.00045;
      const r = 10.5;
      eyeX = lx + Math.cos(orbit) * r;
      eyeZ = lz + Math.sin(orbit) * r;
      eyeY = lElev + 4.2 + Math.sin(this._replayTime * 0.0006) * 0.9;
      const toX = lx - eyeX;
      const toZ = lz - eyeZ;
      camYaw = Math.atan2(toX, toZ);
      camPitch = Math.atan2(eyeY - (lElev + 0.6), Math.hypot(toX, toZ));
    } else {
      const orbit = this._replayTime * 0.00045;
      const r = 8.2;
      eyeX = fx + Math.cos(orbit) * r;
      eyeZ = fz + Math.sin(orbit) * r;
      eyeY = fElev + 3.0 + Math.sin(this._replayTime * 0.0006) * 0.8;
      const toX = fx - eyeX;
      const toZ = fz - eyeZ;
      camYaw = Math.atan2(toX, toZ);
      camPitch = Math.atan2(eyeY - (fElev + 0.6), Math.hypot(toX, toZ));
    }
    const wheelRate = (spd: number) => Math.min(Math.abs(spd) / 0.17, 40) * (spd < 0 ? 1 : -1);
    const carList: (RacingCarAppearance & { x: number; y: number; z: number; yaw: number; r: number; g: number; b: number; speed: number; accel: number; spin: number; slide: number; id: string; bank?: number })[] = [];
    grid.forEach((c, id) => {
      const spin = (this._replaySpins.get(id) ?? 0) + wheelRate(c.speed) * dt * timeDir;
      this._replaySpins.set(id, spin);
      const seedId = id.startsWith('r') ? id.slice(1) : id;
      let seed = this._replaySeedCache.get(id);
      if (seed === undefined) {
        seed = seedId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
        this._replaySeedCache.set(id, seed);
      }
      // The player's own car must keep its REAL appearance (neon underglow,
      // decal, paint) — botAppearanceFor() would otherwise swap in a random
      // bot livery (and often no glow at all) on the replay of your car.
      const isPlayerCar = id === 'replay-player';
      // Use the livery captured from the live race so bots/remotes keep their exact
      // look; fall back to the seeded formula only if an appearance wasn't recorded.
      const recordedApp = this._replayAppearances.get(id);
      const rBank = this.renderer.getTrackBank(c.dist);
      // Appearance spread FIRST, position fields after: botAppearanceFor()/
      // recordedApp return a slot whose x/y/z/yaw/r/g/b defaults to 0 — spread
      // last, they'd dump every NPC car at the world origin with black paint.
      // The player's pa (pure appearance) has no position fields, so its own
      // car was unaffected and only the field vanished in replays.
      carList.push({
        ...(isPlayerCar ? pa : (recordedApp ?? this.botAppearanceFor(seed % 1000, seed))),
        x: c.x, y: this.renderer.getTrackElevation(c.dist) + rBank * this.renderer.getTrackLateral(c.x, c.z) + 0.1, z: c.z, yaw: c.yaw, r: c.r, g: c.g, b: c.b,
        speed: c.speed, accel: c.accel, spin, slide: c.slide, id: c.id, bank: rBank
      });
    });
    const maxSpd = this.getMaxSpeed();
    this.renderer.winTrailAnchor = { x: px, z: pz, yaw: pyaw };
    const nearFinish = this._replayTime >= last.t - RacingRenderer.WIN_TRAIL_SECONDS * 1000;
    if (nearFinish && !this._replayTrailArmed) {
      this.renderer.armWinTrail();
      this._replayTrailArmed = true;
    } else if (!nearFinish) {
      this.renderer.disarmWinTrail();
      this._replayTrailArmed = false;
    }
    this.renderer.render(eyeX, eyeY, eyeZ, camYaw, camPitch, aspect, carList, dt, 1.0, 0, 0,
      this.isRaining, Math.min(1, Math.abs(pspd) / maxSpd), pspd, pacc, 0, pslid, pa, true);
  }
  getPlayerAppearance(): RacingCarAppearance {
    const skin = CAR_SKINS.find(s => s.id === this.playerCar.skinId) || CAR_SKINS[0];
    return {
      rimStyle: this.playerCar.rimId,
      spoilerId: this.playerCar.spoilerId || undefined,
      exhaustId: this.playerCar.exhaustId || undefined,
      accent: ACCENT_COLORS[this.playerCar.accentId] ?? undefined,
      decalStyle: this.playerCar.decalId,
      glow: GLOW_COLORS[this.playerCar.glowId] ?? undefined,
      glowIntensity: this.playerCar.glowIntensity ?? 50,
      metallic: SKIN_FINISH_FACTOR[skin.finish] ?? 0.45,
      skin: this.hexToRgb(skin.color),
    };
  }
  /** Equipped appearance merged with the catalog part currently hovered, so the
   *  WebGL garage car previews rims/accent/decal/glow exactly like the old CSS
   *  preview did. Hovered paint (skinPreview) also swaps the paint + finish, so
   *  anything that alters appearances can be previewed before buying. */
  getPreviewAppearance(): RacingCarAppearance {
    const base = this.getPlayerAppearance();
    const p = this.appearancePreview;
    const out: RacingCarAppearance = { ...base };
    if (this.skinPreview) {
      out.skin = this.hexToRgb(this.skinPreview.color);
      out.metallic = SKIN_FINISH_FACTOR[this.skinPreview.finish] ?? 0.45;
    }
    // The live-preview toggle gates hover-preview: when off, the 3D car keeps
    // the equipped livery while browsing the catalog.
    if (p && !this.garageLivePreview) return out;
    if (!p) return out;
    switch (p.category) {
      case 'rims': out.rimStyle = p.id; break;
      case 'spoiler': out.spoilerId = p.id; break;
      case 'exhaust': out.exhaustId = p.id; break;
      case 'accent': out.accent = ACCENT_COLORS[p.id] ?? base.accent; break;
      case 'decal': out.decalStyle = p.id; break;
      case 'glow': out.glow = GLOW_COLORS[p.id] ?? base.glow; break;
    }
    return out;
  }
  /** Maps the garage car-stage DOM rect into canvas pixels so renderGarage fills
   *  exactly the preview column (desktop) or top strip (mobile). Returns null
   *  while the garage stage isn't rendered yet. */
  private getGarageStageViewport(): { x: number; y: number; w: number; h: number } | null {
    const stage = this.garageStageEl?.nativeElement as HTMLElement | null;
    const canvas = this.canvasRef?.nativeElement;
    if (!stage || !canvas) return null;
    const cr = canvas.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    if (cr.width <= 0 || cr.height <= 0 || sr.width <= 0 || sr.height <= 0) return null;
    const sx = canvas.width / cr.width;
    const sy = canvas.height / cr.height;
    return {
      x: (sr.left - cr.left) * sx,
      y: (sr.top - cr.top) * sy,
      w: sr.width * sx,
      h: sr.height * sy,
    };
  }
  private _glowIntensitySaveTimer: any = null;
  setGlowIntensity(event: Event) {
    const target = event.target as HTMLInputElement;
    const v = Math.max(0, Math.min(100, Math.round(Number(target?.value) || 0)));
    if (this.playerCar) this.playerCar.glowIntensity = v;
    if (this._glowIntensitySaveTimer) clearTimeout(this._glowIntensitySaveTimer);
    this._glowIntensitySaveTimer = setTimeout(() => this.saveCar(), 400);
  }
  get glowIntensityVar(): number {
    const v = this.playerCar?.glowIntensity ?? 50;
    return 0.05 + (v / 100) * 2.2;
  }
  get glowIntensityLabel(): string {
    const v = this.playerCar?.glowIntensity ?? 50;
    if (v < 25) return 'Subtle';
    if (v < 50) return 'Soft';
    if (v < 75) return 'Bright';
    if (v < 95) return 'Vivid';
    return 'Blinding';
  }
  hoveredUpgrade: any = null;
  /** Appearance part hovered in the catalog — previewed on the garage car
   *  without buying (cleared on mouse leave). */
  appearancePreview: RacingAppearancePart | null = null;
  /** Last hovered/tapped appearance part the banner would buy. Kept separate
   *  from appearancePreview because the card's mouseleave clears the visual
   *  preview — without this, moving the pointer toward the banner wiped the
   *  target before the click landed and 'tap to buy' silently did nothing. */
  pendingBuyPart: RacingAppearancePart | null = null;
  /** Paint / skin hovered in the skins tab — previewed on the garage car
   *  (colour + finish shader) without buying (cleared on mouse leave). */
  skinPreview: any = null;
  /** Mobile garage flow: touch screens have no hover, so tapping a catalog card
   *  only previews it (like desktop hover) and the preview banner becomes the
   *  buy/equip button. Desktop keeps hover-preview + click-to-buy on the card. */
  onAppearanceCardClick(part: RacingAppearancePart) {
    if (this.isMobile) { this.appearancePreview = part; this.pendingBuyPart = part; return; }
    this.buyAppearancePart(part);
  }
  onAppearanceCardHover(part: RacingAppearancePart | null) {
    this.appearancePreview = part;
    if (part) this.pendingBuyPart = part;
  }
  onSkinCardClick(skin: any) {
    if (this.isMobile) { this.skinPreview = skin; return; }
    this.selectSkin(skin);
  }
  /** Commits the currently previewed item — the preview banner's buy/equip tap. */
  previewBuy() {
    if (this.isBuying) return;
    const p = this.appearancePreview ?? this.pendingBuyPart;
    const s = this.skinPreview;
    this.appearancePreview = null;
    this.pendingBuyPart = null;
    this.skinPreview = null;
    if (s) { this.selectSkin(s); return; }
    if (p) { this.buyAppearancePart(p); }
  }
  /** Banner title: the part (or skin) the banner would buy/equip right now. */
  get previewBannerName(): string {
    return (this.appearancePreview ?? this.pendingBuyPart ?? this.skinPreview)?.name ?? '';
  }
  /** Banner action text: 'equip'/'buy' for appearance parts, 'equip'/'select'/
   *  'buy' for paint skins. */
  get previewActionText(): string {
    const p = this.appearancePreview ?? this.pendingBuyPart;
    if (p) return this.isAppearanceOwned(p) ? 'equip' : 'buy';
    const s = this.skinPreview;
    if (!s) return 'select';
    if (this.playerCar?.skinId === s.id) return 'equip';
    return !s.owned && s.cost > 0 ? 'buy' : 'select';
  }
  // Per-card marginal top speed in km/h: before = top speed with all lower
  // engine stages but not this one, after = top speed including this stage's
  // statBonus. Engine statBonuses are per-stage additive (getSpeedBonus sums
  // owned stages), so we sum the lower-level defs for the 'before' value.
  // Mirrors getMaxSpeed() exactly (weight included) so numbers match the HUD.
  getEngineStageKph(u: any): { before: number; after: number } {
    const wt = 1 - this.getWeightBonus() / 200;
    let prev = 0;
    for (const d of UPGRADE_DEFS) {
      if (d.category === 'engine' && d.level < u.level) prev += d.statBonus;
    }
    const df = this.getDragFactor();
    return {
      before: Math.round(MAX_SPEED_BASE * (1 + prev / 100) * wt * df * 3.6),
      after: Math.round(MAX_SPEED_BASE * (1 + (prev + u.statBonus) / 100) * wt * df * 3.6),
    };
  }
  getStatPreview(u: any): { before: number; after: number; label: string } {
    const current = this.getUpgradeLevel(u.category);
    const bonus = u.statBonus;
    const cat = u.category;
    let beforeVal = 0, afterVal = 0, label = '';
    switch (cat) {
      case 'engine': label = 'TOP SPEED'; beforeVal = Math.round(MAX_SPEED_BASE * (1 + this.getSpeedBonus() / 100) * 3.6); break;
      case 'tires': label = 'GRIP'; beforeVal = Math.round((0.85 + this.getGripBonus() / 100) * 100); break;
      case 'suspension': label = 'CORNER'; beforeVal = Math.round((0.8 + this.getCornerBonus() / 100) * 100); break;
      case 'brakes': label = 'BRAKING'; beforeVal = Math.round(BRAKE_FORCE * (1 + this.getBrakeBonus() / 100)); break;
      case 'body': label = 'WEIGHT'; beforeVal = Math.round(this.getWeightBonus()); break;
    }
    afterVal = beforeVal + (cat === 'body' ? bonus : Math.round(bonus * (cat === 'engine' ? 0.55 : cat === 'tires' ? 1 : cat === 'suspension' ? 1 : 1.3)));
    if (cat === 'engine') {
      const tempBonus = this.getSpeedBonus() + bonus;
      afterVal = Math.round(MAX_SPEED_BASE * (1 + tempBonus / 100) * (1 - this.getWeightBonus() / 200) * this.getDragFactor() * 3.6);
    }
    return { before: beforeVal, after: afterVal, label };
  }
  joyStart(e: TouchEvent | PointerEvent) {
    if (this.joyActive) return;
    const pt = this.joyPoint(e);
    if (!pt) return;
    this.joyActive = true;
    const rect = this.joyZoneEl?.nativeElement?.getBoundingClientRect?.();
    if (rect && rect.width > 0 && rect.height > 0) {
      this.joyBaseCenterX = rect.left + rect.width / 2;
      this.joyBaseCenterY = rect.top + rect.height / 2;
    }
    this.joyOriginX = pt.clientX;
    this.joyOriginY = pt.clientY;
    try { this.joyZoneEl?.nativeElement?.setPointerCapture?.((e as PointerEvent).pointerId); } catch { }
    this.joyMove(e);
    e.preventDefault();
  }
  joyMove(e: TouchEvent | PointerEvent) {
    if (!this.joyActive) return;
    const pt = this.joyPoint(e);
    if (!pt) return;
    let dx = pt.clientX - this.joyOriginX;
    const dist = Math.abs(dx);
    if (dist > this.joyRadius) dx = (dx / dist) * this.joyRadius;
    this.joyX = Math.max(-1, Math.min(1, dx / this.joyRadius));
    this.joyY = 0;
    if (this.joyThumbEl?.nativeElement) {
      let vx = pt.clientX - this.joyBaseCenterX;
      vx = Math.max(-this.joyThumbTravel, Math.min(this.joyThumbTravel, vx));
      this.joyThumbEl.nativeElement.style.transform = `translate(${vx}px, 0px)`;
    }
    e.preventDefault();
  }
  joyEnd() {
    this.joyActive = false;
    this.joyX = 0;
    this.joyY = 0;
    if (this.joyThumbEl?.nativeElement) {
      this.joyThumbEl.nativeElement.style.transform = 'translate(0px, 0px)';
    }
  }
  gasDown() { this.gasHeld = true; this._gasPressAt = performance.now(); }
  gasUp() { this.gasHeld = false; }
  brakeDown() { this.brakeHeld = true; }
  brakeUp() { this.brakeHeld = false; }
  private joyPoint(e: TouchEvent | PointerEvent): { clientX: number; clientY: number } | null {
    if (e instanceof TouchEvent) {
      if (e.touches.length === 0) return null;
      let best = e.touches[0];
      let bestD = Infinity;
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        const d = Math.hypot(t.clientX - this.joyOriginX, t.clientY - this.joyOriginY);
        if (d < bestD) { bestD = d; best = t; }
      }
      return { clientX: best.clientX, clientY: best.clientY };
    }
    return { clientX: e.clientX, clientY: e.clientY };
  }
  private addMessage(msg: string) {
    this.messages.push(msg);
    if (this.messages.length > 5) this.messages.shift();
    if (this.msgTimer) clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => this.messages = [], 4000);
  }
  private showRecordToast(prev: number, curr: number, trackId: number) {
    if (curr <= 0) return;
    this.recordToast = { old: prev, new: curr, trackId };
    if (this._recordToastTimer) clearTimeout(this._recordToastTimer);
    this._recordToastTimer = setTimeout(() => this.recordToast = null, 4500);
  }
  private async maybeCelebrateFriendBeat(trackId: number, prevBest: number) {
    if (this.bestLapTime <= 0) return;
    if (this.friendRecords.length === 0) {
      const uid = this.parentRef?.user?.id ?? 0;
      if (!uid) return;
      this.friendRecords = await this.racingService.getFriendRecords(uid);
    }
    let fastestLap = 0;
    let fastestName = '';
    for (const f of this.friendRecords) {
      const lap = f.bestLapsByTrack && f.bestLapsByTrack[trackId];
      if (lap && lap > 0 && (fastestLap === 0 || lap < fastestLap)) {
        fastestLap = lap;
        fastestName = f.playerName;
      }
    }
    if (fastestLap <= 0) return;
    const wasAlreadyAhead = prevBest > 0 && prevBest < fastestLap;
    if (wasAlreadyAhead || this.bestLapTime >= fastestLap) return;
    this.showBeatFriendToast(fastestName, fastestLap - this.bestLapTime, trackId);
  }
  private showBeatFriendToast(friendName: string, margin: number, trackId: number) {
    this.beatFriendToast = { friendName, margin, trackId };
    if (this._beatFriendToastTimer) clearTimeout(this._beatFriendToastTimer);
    this._beatFriendToastTimer = setTimeout(() => this.beatFriendToast = null, 4500);
  }
  getBeatFriendToastTrack(): string {
    const t = this.beatFriendToast;
    if (!t) return '';
    const track = this.trackDefs.find(x => x.id === t.trackId);
    return track ? track.name : 'this track';
  }
  getBeatFriendMarginText(): string {
    const t = this.beatFriendToast;
    if (!t) return '';
    return `${(t.margin / 1000).toFixed(1)}s`;
  }
  getRecordToastTimes(): string {
    const t = this.recordToast;
    if (!t) return '';
    const oldStr = t.old > 0 ? this.formatTime(t.old) : '—';
    return `${oldStr} → ${this.formatTime(t.new)}`;
  }
  getRecordToastTrack(): string {
    const t = this.recordToast;
    if (!t) return '';
    const track = this.trackDefs.find(x => x.id === t.trackId);
    return track ? track.name : 'this track';
  }
  formatTime(ms: number): string {
    if (!ms || ms === Infinity) return '--:--';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}.${Math.floor((ms % 1000) / 100)}`;
  }
  hasBestLap(): boolean {
    return this.bestLapTime > 0 && this.bestLapTime < 99999999;
  }
  getGear(): string {
    if (this.carSpeed < 1) return 'N';
    const speed = Math.abs(this.carSpeed);
    if (speed < 10) return '1';
    if (speed < 20) return '2';
    if (speed < 30) return '3';
    if (speed < 40) return '4';
    if (speed < 50) return '5';
    return '6';
  }
  getShiftLedCount(): number {
    return Math.round(Math.min(1, this.hudRPM) * 5);
  }
  getShiftLedClass(i: number): string {
    if (i >= this.getShiftLedCount()) return '';
    if (i < 2) return 'led-green';
    if (i < 4) return 'led-amber';
    return 'led-red';
  }
  getDrsActive(): boolean {
    return Math.abs(this.carSpeed) / this.getMaxSpeed() > 0.75 && !this.isOffTrack;
  }
  getBrakeHeatPercent(): number {
    return Math.min(100, (this.hudBrakeHeat / BRAKE_HEAT_FADE_TOP) * 100);
  }
  getBrakePeakPercent(): number {
    return Math.min(100, (this._brakePeakThisLap / BRAKE_HEAT_FADE_TOP) * 100);
  }
  getBrakeHeatState(): 'cool' | 'warm' | 'hot' {
    if (this.hudBrakeHeat >= BRAKE_HEAT_FADE_ON) return 'hot';
    if (this.hudBrakeHeat >= 0.6) return 'warm';
    return 'cool';
  }
  getAnalogNeedleDeg(): number {
    return -120 + Math.min(1, this.hudRPM) * 240;
  }
  closeLoginPanel() {
    this.gameState = 'menu';
  }
  closeLeaderboard() {
    this.showLeaderboard = false;
    this.parentRef?.closeOverlay();
  }
  toggleOptions() {
    if (this._destroyed) return;
    this.showOptions = !this.showOptions;
  }
  toggleCameraShake() {
    if (this._destroyed) return;
    this.cameraShakeOn = !this.cameraShakeOn;
    try { localStorage.setItem('gp_shake', this.cameraShakeOn ? '1' : '0'); } catch { }
  }
  toggleSpeedFov() {
    if (this._destroyed) return;
    this.speedFovOn = !this.speedFovOn;
    try { localStorage.setItem('gp_fov', this.speedFovOn ? '1' : '0'); } catch { }
  }
  toggleGarageLivePreview() {
    if (this._destroyed) return;
    this.garageLivePreview = !this.garageLivePreview;
    try { localStorage.setItem('gp_livepreview', this.garageLivePreview ? '1' : '0'); } catch { }
    if (!this.garageLivePreview) { this.appearancePreview = null; this.skinPreview = null; }
  }
  toggleSound() {
    if (this._destroyed) return;
    this.soundOn = !this.soundOn;
    try { localStorage.setItem('gp_sound', this.soundOn ? '1' : '0'); } catch { }
    if (this.soundOn) {
      if (!this._audioCtx) this.initEngineAudio();
    } else {
      this.stopEngineAudio();
    }
  }
  private stopEngineAudio() {
    try {
      for (const osc of [this._subOsc, this._engineOsc, this._engineOsc2, this._harmOsc, this._thrumLfo]) {
        if (osc) { try { osc.stop(); } catch { } osc.disconnect(); }
      }
      if (this._windSource) { try { this._windSource.stop(); } catch { } this._windSource.disconnect(); }
      if (this._crowdSource) { try { this._crowdSource.stop(); } catch { } this._crowdSource.disconnect(); }
      if (this._crowdFilter) this._crowdFilter.disconnect();
      if (this._crowdFilter2) this._crowdFilter2.disconnect();
      if (this._crowdGain) this._crowdGain.disconnect();
      if (this._screechSource) { try { this._screechSource.stop(); } catch { } this._screechSource.disconnect(); }
      if (this._screechFilter) this._screechFilter.disconnect();
      if (this._screechGain) this._screechGain.disconnect();
      if (this._squealSource) { try { this._squealSource.stop(); } catch { } this._squealSource.disconnect(); }
      if (this._squealFilter) this._squealFilter.disconnect();
      if (this._squealGain) this._squealGain.disconnect();
      if (this._squealRingOsc) { try { this._squealRingOsc.stop(); } catch { } this._squealRingOsc.disconnect(); }
      if (this._squealRingGain) this._squealRingGain.disconnect();
      for (const v of this._remoteVoices) {
        try { v.engineOsc.stop(); } catch { }
        try { v.screechSource.stop(); } catch { }
        v.engineOsc.disconnect();
        v.engineFilter.disconnect();
        v.engineGain.disconnect();
        v.screechSource.disconnect();
        v.screechFilter.disconnect();
        v.screechGain.disconnect();
      }
      this._remoteVoices = [];
      if (this._thrumLfoGain) this._thrumLfoGain.disconnect();
      if (this._windFilter) this._windFilter.disconnect();
      if (this._windGain) this._windGain.disconnect();
      if (this._engineFilter) this._engineFilter.disconnect();
      if (this._engineGain) this._engineGain.disconnect();
    } catch { }
    try { if (this._audioCtx) this._audioCtx.close(); } catch { }
    this._subOsc = null;
    this._engineOsc = null;
    this._engineOsc2 = null;
    this._harmOsc = null;
    this._thrumLfo = null;
    this._thrumLfoGain = null;
    this._windSource = null;
    this._windFilter = null;
    this._windGain = null;
    this._crowdSource = null;
    this._crowdFilter = null;
    this._crowdFilter2 = null;
    this._crowdGain = null;
    this._screechSource = null;
    this._screechFilter = null;
    this._screechGain = null;
    this._squealSource = null;
    this._squealFilter = null;
    this._squealGain = null;
    this._squealRingOsc = null;
    this._squealRingGain = null;
    this._engineFilter = null;
    this._engineGain = null;
    this._audioCtx = null;
  }
  private initEngineAudio() {
    if (this._destroyed) return;
    try {
      const ctx = new AudioContext();
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch { } }
      this._audioCtx = ctx;
      this._engineFilter = ctx.createBiquadFilter();
      this._engineFilter.type = 'lowpass';
      this._engineFilter.frequency.value = 600;
      this._engineFilter.Q.value = 0.8;
      this._engineGain = ctx.createGain();
      this._engineGain.gain.value = 0.06;
      this._engineFilter.connect(this._engineGain);
      this._engineGain.connect(ctx.destination);
      this._subOsc = ctx.createOscillator();
      this._subOsc.type = 'sine';
      const subGain = ctx.createGain();
      subGain.gain.value = 0.5;
      this._subOsc.connect(subGain);
      subGain.connect(this._engineFilter);
      this._engineOsc = ctx.createOscillator();
      this._engineOsc.type = 'sawtooth';
      this._engineOsc.detune.value = -6;
      const mainGain = ctx.createGain();
      mainGain.gain.value = 0.3;
      this._engineOsc.connect(mainGain);
      mainGain.connect(this._engineFilter);
      this._engineOsc2 = ctx.createOscillator();
      this._engineOsc2.type = 'sawtooth';
      this._engineOsc2.detune.value = 6;
      const mainGain2 = ctx.createGain();
      mainGain2.gain.value = 0.3;
      this._engineOsc2.connect(mainGain2);
      mainGain2.connect(this._engineFilter);
      this._harmOsc = ctx.createOscillator();
      this._harmOsc.type = 'sawtooth';
      const harmGain = ctx.createGain();
      harmGain.gain.value = 0.12;
      this._harmOsc.connect(harmGain);
      harmGain.connect(this._engineFilter);
      this._thrumLfo = ctx.createOscillator();
      this._thrumLfo.type = 'sine';
      this._thrumLfo.frequency.value = 7;
      this._thrumLfoGain = ctx.createGain();
      this._thrumLfoGain.gain.value = 70;
      this._thrumLfo.connect(this._thrumLfoGain);
      this._thrumLfoGain.connect(this._engineFilter.frequency);
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._windSource = ctx.createBufferSource();
      this._windSource.buffer = buf;
      this._windSource.loop = true;
      this._windFilter = ctx.createBiquadFilter();
      this._windFilter.type = 'bandpass';
      this._windFilter.frequency.value = 800;
      this._windFilter.Q.value = 0.5;
      this._windGain = ctx.createGain();
      this._windGain.gain.value = 0;
      this._windSource.connect(this._windFilter);
      this._windFilter.connect(this._windGain);
      this._windGain.connect(ctx.destination);
      const crowdLen = ctx.sampleRate * 4;
      const crowdBuf = ctx.createBuffer(1, crowdLen, ctx.sampleRate);
      const cdata = crowdBuf.getChannelData(0);
      let cLevel = 0.45;
      const cStep = Math.floor(ctx.sampleRate * 0.25);
      for (let i = 0; i < crowdLen; i++) {
        if (i % cStep === 0) cLevel = Math.max(0.12, Math.min(1, cLevel + (Math.random() - 0.5) * 0.45));
        cdata[i] = (Math.random() * 2 - 1) * cLevel;
      }
      this._crowdSource = ctx.createBufferSource();
      this._crowdSource.buffer = crowdBuf;
      this._crowdSource.loop = true;
      this._crowdFilter = ctx.createBiquadFilter();
      this._crowdFilter.type = 'bandpass';
      this._crowdFilter.frequency.value = 700;
      this._crowdFilter.Q.value = 0.45;
      this._crowdFilter2 = ctx.createBiquadFilter();
      this._crowdFilter2.type = 'bandpass';
      this._crowdFilter2.frequency.value = 1700;
      this._crowdFilter2.Q.value = 0.55;
      this._crowdGain = ctx.createGain();
      this._crowdGain.gain.value = 0;
      this._crowdSource.connect(this._crowdFilter);
      this._crowdFilter.connect(this._crowdGain);
      this._crowdSource.connect(this._crowdFilter2);
      this._crowdFilter2.connect(this._crowdGain);
      this._crowdGain.connect(ctx.destination);
      this._screechSource = ctx.createBufferSource();
      this._screechSource.buffer = buf;
      this._screechSource.loop = true;
      this._screechFilter = ctx.createBiquadFilter();
      this._screechFilter.type = 'bandpass';
      this._screechFilter.frequency.value = 2200;
      this._screechFilter.Q.value = 1.5;
      this._screechGain = ctx.createGain();
      this._screechGain.gain.value = 0;
      this._screechSource.connect(this._screechFilter);
      this._screechFilter.connect(this._screechGain);
      this._screechGain.connect(ctx.destination);
      this._squealSource = ctx.createBufferSource();
      this._squealSource.buffer = buf;
      this._squealSource.loop = true;
      this._squealFilter = ctx.createBiquadFilter();
      this._squealFilter.type = 'bandpass';
      this._squealFilter.frequency.value = 2800;
      this._squealFilter.Q.value = 2.5;
      this._squealGain = ctx.createGain();
      this._squealGain.gain.value = 0;
      this._squealSource.connect(this._squealFilter);
      this._squealFilter.connect(this._squealGain);
      this._squealGain.connect(ctx.destination);
      this._squealRingOsc = ctx.createOscillator();
      this._squealRingOsc.type = 'sine';
      this._squealRingOsc.frequency.value = 2800;
      this._squealRingGain = ctx.createGain();
      this._squealRingGain.gain.value = 0.05;
      this._squealRingOsc.connect(this._squealRingGain);
      this._squealRingGain.connect(this._squealGain);
      this._squealRingOsc.start();
      this._remoteVoices = [];
      for (let i = 0; i < RacingComponent.MAX_REMOTE_VOICES; i++) {
        const vOsc = ctx.createOscillator();
        vOsc.type = 'sawtooth';
        vOsc.frequency.value = 80;
        const vFilter = ctx.createBiquadFilter();
        vFilter.type = 'lowpass';
        vFilter.frequency.value = 400;
        vFilter.Q.value = 0.8;
        const vGain = ctx.createGain();
        vGain.gain.value = 0;
        vOsc.connect(vFilter);
        vFilter.connect(vGain);
        vGain.connect(ctx.destination);
        const sSource = ctx.createBufferSource();
        sSource.buffer = buf;
        sSource.loop = true;
        const sFilter = ctx.createBiquadFilter();
        sFilter.type = 'bandpass';
        sFilter.frequency.value = 2200;
        sFilter.Q.value = 1.2;
        const sGain = ctx.createGain();
        sGain.gain.value = 0;
        sSource.connect(sFilter);
        sFilter.connect(sGain);
        sGain.connect(ctx.destination);
        vOsc.start();
        sSource.start();
        this._remoteVoices.push({ engineOsc: vOsc, engineFilter: vFilter, engineGain: vGain, screechSource: sSource, screechFilter: sFilter, screechGain: sGain });
      }
      this._subOsc.start();
      this._screechSource.start();
      this._squealSource.start();
      this._engineOsc.start();
      this._engineOsc2.start();
      this._harmOsc.start();
      this._thrumLfo.start();
      this._windSource.start();
      this._crowdSource.start();
    } catch { }
  }
  private updateEngineAudio() {
    if (this._destroyed || !this.soundOn || !this._audioCtx || !this._engineOsc || !this._engineFilter || !this._engineGain) return;
    const t = this._audioCtx.currentTime;
    if (this.gameState !== 'racing' && this.gameState !== 'countdown') {
      if (this._engineOsc) this._engineOsc.frequency.setTargetAtTime(70, t, 0.15);
      if (this._engineOsc2) this._engineOsc2.frequency.setTargetAtTime(70, t, 0.15);
      if (this._subOsc) this._subOsc.frequency.setTargetAtTime(35, t, 0.15);
      if (this._harmOsc) this._harmOsc.frequency.setTargetAtTime(140, t, 0.15);
      this._engineGain.gain.setTargetAtTime(0, t, 0.2);
      if (this._windGain) this._windGain.gain.setTargetAtTime(0, t, 0.2);
      if (this._crowdGain) this._crowdGain.gain.setTargetAtTime(0, t, 0.2);
      if (this._screechGain) this._screechGain.gain.setTargetAtTime(0, t, 0.1);
      if (this._squealGain) this._squealGain.gain.setTargetAtTime(0, t, 0.1);
      for (const v of this._remoteVoices) {
        v.engineGain.gain.setTargetAtTime(0, t, 0.1);
        v.screechGain.gain.setTargetAtTime(0, t, 0.1);
      }
      return;
    }
    const speed = Math.abs(this.carSpeed);
    const maxSpd = this.getMaxSpeed();
    // On the grid the car is parked, so the throttle drives a virtual "rev"
    // speed instead — the engine winds up and the gauges climb, but nothing
    // moves until the race starts.
    const revving = this.gameState === 'countdown';
    const revSpeed = revving ? this._countdownRev * maxSpd : speed;
    const rpm = Math.max(0.3, Math.min(1.25, revSpeed / maxSpd * 1.35 + 0.3));
    // Exhaust upgrades shape the engine's voice: quad barrels (Twin Tips / Quad)
    // drop the pitch and roll off the highs for a deep rumble; twin tips
    // (Sport / Titanium / Carbon) sharpen the pitch, brighten the cutoff and
    // push the rasp harmonic for a higher, raspier note. Stock has no exhaustId.
    const exhId = this.playerCar.exhaustId;
    const exhQuad = exhId === 303 || exhId === 304;
    const exhRasp = exhId === 301 || exhId === 302 || exhId === 305;
    let baseFreq = 52 + rpm * 140;
    let filterFreq = 350 + rpm * 900;
    let harmMult = 2;
    let detune = 6;
    if (exhQuad) {
      baseFreq *= 0.85;      // deeper rumble
      filterFreq *= 0.78;    // muffled, throaty tail note
      detune = 2;            // less saw-beat, solid tone
    } else if (exhRasp) {
      baseFreq *= 1.06;      // sharper pitch
      filterFreq *= 1.18;    // brighter, raspier tail note
      harmMult = 2.3;        // more inharmonic rasp harmonic
      detune = 10;           // more saw-beat crackle
    }
    // Grade pitch bend: the engine revs freer (brighter, higher) on descents
    // and strains (duller, lower) on climbs, so hills are audible too, not
    // just a physics assist. The bright tail note follows partway.
    const gr = Math.max(-1, Math.min(1, this.renderer?.getTrackGrade(this.carDist) ?? 0));
    baseFreq *= 1 + gr * 0.8;
    filterFreq *= 1 + gr * 0.45;
    if (this._subOsc) this._subOsc.frequency.setTargetAtTime(baseFreq * 0.5, t, 0.05);
    if (this._engineOsc) this._engineOsc.frequency.setTargetAtTime(baseFreq, t, 0.05);
    if (this._engineOsc2) {
      this._engineOsc2.frequency.setTargetAtTime(baseFreq, t, 0.05);
      this._engineOsc2.detune.setTargetAtTime(detune, t, 0.08);
    }
    if (this._harmOsc) this._harmOsc.frequency.setTargetAtTime(baseFreq * harmMult, t, 0.05);
    this._engineFilter.frequency.setTargetAtTime(filterFreq, t, 0.08);
    this._engineGain.gain.setTargetAtTime(0.04 + rpm * 0.05, t, 0.08);
    const speedRatio = Math.min(1, revSpeed / maxSpd);
    // No wind noise while parked on the grid — only the revved engine.
    if (this._windFilter) this._windFilter.frequency.setTargetAtTime(400 + speedRatio * 2200, t, 0.15);
    if (this._windGain) this._windGain.gain.setTargetAtTime(revving ? 0 : speedRatio * speedRatio * 0.05, t, 0.15);
    const slide = Math.min(1, this._playerSlide);
    if (this._screechGain) {
      this._screechGain.gain.setTargetAtTime(slide * 0.055, t, 0.05);
      if (this._screechFilter) this._screechFilter.frequency.setTargetAtTime(1800 + slide * 1800, t, 0.07);
    }
    const lock = this.renderer?.getPlayerLock() ?? 0;
    const brakeSqueal = lock * Math.min(1, speed / 8);
    const brakeHeat = this.renderer?.getPlayerBrakeHeat() ?? 0;
    if (this._squealGain) {
      this._squealGain.gain.setTargetAtTime(brakeSqueal * 0.032, t, 0.05);
      if (this._squealFilter) {
        const wobble = Math.sin(t * 12) * 120 * brakeSqueal;
        const heatFrac = Math.min(1, Math.max(0, brakeHeat / BRAKE_HEAT_FADE_TOP));
        const heatDrop = Math.pow(heatFrac, 1.5) * 900;
        const squealFreq = 2600 + speedRatio * 2400 + wobble - heatDrop;
        this._squealFilter.frequency.setTargetAtTime(squealFreq, t, 0.06);
        this._squealFilter.Q.setTargetAtTime(2.2 + brakeSqueal * 1.8, t, 0.08);
        if (this._squealRingOsc) {
          this._squealRingOsc.frequency.setTargetAtTime(squealFreq, t, 0.06);
        }
      }
    }
    if (this._remoteVoices.length > 0) {
      const cars: { x: number; z: number; yaw: number; speed: number; slide: number }[] = [];
      for (const b of this.bots) cars.push({ x: b.x, z: b.z, yaw: b.yaw, speed: Math.abs(b.speed), slide: b.slide || 0 });
      this.remoteCars.forEach(rc => cars.push({ x: rc.x, z: rc.z, yaw: rc.yaw, speed: Math.abs(rc.speed), slide: rc.slide || 0 }));
      cars.sort((a, b) => Math.hypot(a.x - this.carX, a.z - this.carZ) - Math.hypot(b.x - this.carX, b.z - this.carZ));
      const reach = RacingComponent.REMOTE_AUDIBLE;
      for (let i = 0; i < this._remoteVoices.length; i++) {
        const v = this._remoteVoices[i];
        if (i < cars.length) {
          const c = cars[i];
          const dist = Math.hypot(c.x - this.carX, c.z - this.carZ);
          const att = dist >= reach ? 0 : Math.pow(1 - dist / reach, 2);
          const rpmV = Math.max(0.3, Math.min(1.25, Math.abs(c.speed) / maxSpd * 1.35 + 0.3));
          const baseF = 52 + rpmV * 140;
          v.engineOsc.frequency.setTargetAtTime(baseF, t, 0.1);
          v.engineFilter.frequency.setTargetAtTime(350 + rpmV * 900, t, 0.12);
          v.engineGain.gain.setTargetAtTime(att * 0.05, t, 0.1);
          v.screechFilter.frequency.setTargetAtTime(1800 + Math.min(1, c.slide) * 1800, t, 0.08);
          v.screechGain.gain.setTargetAtTime(att * Math.min(1, c.slide) * 0.05, t, 0.08);
        } else {
          v.engineGain.gain.setTargetAtTime(0, t, 0.12);
          v.screechGain.gain.setTargetAtTime(0, t, 0.1);
        }
      }
    }
    if (this._crowdGain && this.renderer) {
      const td = this.renderer.totalTrackDist;
      if (td > 0) {
        const lapPos = ((this.carDist % td) + td) % td;
        let nearest = Infinity;
        for (const f of RacingComponent.GRANDSTAND_FRACS) {
          const standDist = f * td;
          const d = Math.abs(lapPos - standDist);
          const wrapped = Math.min(d, td - d);
          if (wrapped < nearest) nearest = wrapped;
        }
        if (this._prevLapFrac >= 0) {
          const lapFrac = lapPos / td;
          let crossed = -1;
          for (let i = 0; i < RacingComponent.GRANDSTAND_FRACS.length; i++) {
            const f = RacingComponent.GRANDSTAND_FRACS[i];
            const crossedIt = this._prevLapFrac <= lapFrac
              ? (this._prevLapFrac <= f && f <= lapFrac)
              : (f >= this._prevLapFrac || f <= lapFrac); 
            if (crossedIt) { crossed = i; break; }
          }
          if (crossed >= 0 && Math.abs(this.carSpeed) >= RacingComponent.STAND_ROAR_SPEED
            && performance.now() - this._lastStandRoarAt >= RacingComponent.STAND_ROAR_COOLDOWN) {
            this._lastStandRoarAt = performance.now();
            this.playStandRoar(Math.abs(this.carSpeed));
            this.renderer.exciteCrowd(1);
          }
        }
        this._prevLapFrac = lapPos / td;
        const reach = RacingComponent.CROWD_REACH;
        const level = nearest >= reach ? 0 : (1 - nearest / reach) * 0.05;
        this._crowdGain.gain.setTargetAtTime(level, t, 0.1);
        if (this._crowdFilter) {
          this._crowdFilter.frequency.setTargetAtTime(600 + (level / 0.05) * 400, t, 0.15);
        }
        if (this._crowdFilter2) {
          this._crowdFilter2.frequency.setTargetAtTime(1500 + (level / 0.05) * 900, t, 0.15);
        }
        if (nearest < reach * 0.45 && performance.now() > this._nextCrowdFxAt) {
          this._nextCrowdFxAt = performance.now() + 6500 + Math.random() * 9000;
          const fxTypes: ('roar' | 'whistle' | 'applause' | 'wave')[] = ['roar', 'whistle', 'applause', 'wave'];
          this.playCrowdCheer(fxTypes[Math.floor(Math.random() * fxTypes.length)], 0.75);
        }
      }
    }
  }
  private playStandRoar(speed: number) {
    if (this._destroyed || !this.soundOn || !this._audioCtx || this.gameState !== 'racing') return;
    try {
      const ctx = this._audioCtx;
      const t = ctx.currentTime;
      const dur = 2.2;
      const doppler = 1 + Math.min(0.16, 0.04 + (speed - RacingComponent.STAND_ROAR_SPEED) * 0.003);
      const peak = 0.11 * Math.min(1.5, 0.75 + speed / 40);
      const layers: { center: number; q: number; vol: number; attack: number; flutter: number }[] = [
        { center: 480 * doppler, q: 0.6, vol: 1.0, attack: 0.12, flutter: 8 },
        { center: 1250 * doppler, q: 0.7, vol: 0.7, attack: 0.09, flutter: 13 },
        { center: 2300 * doppler, q: 0.8, vol: 0.4, attack: 0.06, flutter: 18 },
      ];
      for (const L of layers) {
        const len = Math.floor(ctx.sampleRate * dur);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
          const sec = i / ctx.sampleRate;
          const env = Math.min(1, sec / L.attack) * Math.exp(-sec * 1.6);
          const flutter = 0.55 + 0.45 * Math.sin(sec * L.flutter * Math.PI + (i % 7) * 0.9);
          d[i] = (Math.random() * 2 - 1) * env * flutter;
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = L.center;
        filter.Q.value = L.q;
        const g = ctx.createGain();
        g.gain.value = peak * L.vol;
        src.connect(filter); filter.connect(g); g.connect(ctx.destination);
        src.start(t); src.stop(t + dur + 0.05);
      }
    } catch { }
  }
  private playCrowdCheer(type: 'roar' | 'whistle' | 'applause' | 'wave' | 'big' = 'roar', intensity = 1) {
    if (this._destroyed || !this.soundOn || !this._audioCtx || this.gameState !== 'racing') return;
    try {
      const ctx = this._audioCtx;
      const t = ctx.currentTime;
      const dur = type === 'big' ? 3.4 : type === 'applause' ? 2.2 : 2.6;
      const peak = (type === 'big' ? 0.13 : 0.085) * intensity;
      if (type === 'wave') {
        const wLen = Math.floor(ctx.sampleRate * 4.4);
        const wBuf = ctx.createBuffer(1, wLen, ctx.sampleRate);
        const wd = wBuf.getChannelData(0);
        for (let i = 0; i < wLen; i++) {
          const sec = i / ctx.sampleRate;
          const swell = Math.max(0, Math.sin(sec * 0.6 * Math.PI));
          const flutter = 0.6 + 0.4 * Math.sin(sec * 12 * Math.PI);
          wd[i] = (Math.random() * 2 - 1) * swell * flutter;
        }
        const wSrc = ctx.createBufferSource();
        wSrc.buffer = wBuf;
        const wFilter = ctx.createBiquadFilter();
        wFilter.type = 'bandpass';
        wFilter.frequency.value = 1100;
        wFilter.Q.value = 0.5;
        const wGain = ctx.createGain();
        wGain.gain.value = peak;
        wSrc.connect(wFilter); wFilter.connect(wGain); wGain.connect(ctx.destination);
        wSrc.start(t); wSrc.stop(t + 4.45);
        return;
      }
      const layers: { center: number; q: number; vol: number; attack: number; flutter: number }[] = [
        { center: 550, q: 0.5, vol: 1.0, attack: 0.3, flutter: 7 },
        { center: 1350, q: 0.6, vol: 0.75, attack: 0.18, flutter: 11 },
        { center: 2400, q: 0.7, vol: 0.35, attack: 0.1, flutter: 16 },
      ];
      if (type === 'applause') {
        layers[0].vol = 0.35; layers[1].vol = 0.7; layers[2].vol = 1.05;
      }
      for (const L of layers) {
        const len = Math.floor(ctx.sampleRate * dur);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
          const sec = i / ctx.sampleRate;
          const flutter = 0.6 + 0.4 * Math.sin(sec * L.flutter * Math.PI + (i % 7) * 0.9);
          d[i] = (Math.random() * 2 - 1) * flutter;
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = L.center;
        f.Q.value = L.q;
        const g = ctx.createGain();
        const v = peak * L.vol;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(v, t + L.attack);
        g.gain.setValueAtTime(v, t + dur * 0.6);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(f); f.connect(g); g.connect(ctx.destination);
        src.start(t); src.stop(t + dur + 0.05);
      }
      if (type === 'whistle' || type === 'big') {
        const blips = type === 'whistle' ? 3 + Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 2);
        for (let b = 0; b < blips; b++) {
          const bt = t + 0.25 + Math.random() * dur * 0.7;
          const blen = 0.1 + Math.random() * 0.16;
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.setValueAtTime(2100 + Math.random() * 900, bt);
          o.frequency.exponentialRampToValueAtTime(1600 + Math.random() * 400, bt + blen);
          const og = ctx.createGain();
          const v = peak * (0.1 + Math.random() * 0.14);
          og.gain.setValueAtTime(0, bt);
          og.gain.linearRampToValueAtTime(v, bt + 0.02);
          og.gain.exponentialRampToValueAtTime(0.001, bt + blen);
          o.connect(og); og.connect(ctx.destination);
          o.start(bt); o.stop(bt + blen + 0.02);
        }
      }
    } catch { }
  }
  private playWinnerCheer() {
    if (this._destroyed || !this.soundOn || !this._audioCtx) return;
    try {
      const ctx = this._audioCtx;
      const t = ctx.currentTime;
      const dur = 4.2;
      const peak = 0.16;
      const layers: { center: number; q: number; vol: number; attack: number; flutter: number }[] = [
        { center: 500, q: 0.45, vol: 1.0, attack: 0.25, flutter: 6 },
        { center: 1300, q: 0.55, vol: 0.8, attack: 0.15, flutter: 10 },
        { center: 2600, q: 0.7, vol: 0.45, attack: 0.08, flutter: 18 },
      ];
      for (const L of layers) {
        const len = Math.floor(ctx.sampleRate * dur);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
          const sec = i / ctx.sampleRate;
          const flutter = 0.6 + 0.4 * Math.sin(sec * L.flutter * Math.PI + (i % 7) * 0.9);
          d[i] = (Math.random() * 2 - 1) * flutter;
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = L.center;
        f.Q.value = L.q;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(peak * L.vol, t + L.attack);
        g.gain.setValueAtTime(peak * L.vol, t + dur * 0.65);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(f); f.connect(g); g.connect(ctx.destination);
        src.start(t); src.stop(t + dur + 0.05);
      }
      const lead = ctx.createOscillator();
      lead.type = 'sine';
      lead.frequency.setValueAtTime(2400, t);
      lead.frequency.exponentialRampToValueAtTime(3200, t + 0.12);
      const lg = ctx.createGain();
      lg.gain.setValueAtTime(0.0001, t);
      lg.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
      lg.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      lead.connect(lg); lg.connect(ctx.destination);
      lead.start(t); lead.stop(t + 0.32);
      for (let b = 0; b < 3 + Math.floor(Math.random() * 3); b++) {
        const bt = t + 0.4 + Math.random() * dur * 0.75;
        const blen = 0.09 + Math.random() * 0.15;
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(2000 + Math.random() * 1000, bt);
        o.frequency.exponentialRampToValueAtTime(1500 + Math.random() * 500, bt + blen);
        const og = ctx.createGain();
        og.gain.setValueAtTime(0, bt);
        og.gain.linearRampToValueAtTime(0.045, bt + 0.02);
        og.gain.exponentialRampToValueAtTime(0.001, bt + blen);
        o.connect(og); og.connect(ctx.destination);
        o.start(bt); o.stop(bt + blen + 0.02);
      }
    } catch { }
  }
  private playImpactSound(intensity = 1, gainScale = 1) {
    if (this._destroyed || !this.soundOn || !this._audioCtx || this.gameState !== 'racing') return;
    try {
      const ctx = this._audioCtx;
      const t = ctx.currentTime;
      const dur = 0.3;
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const env = Math.pow(1 - i / len, 3);
        d[i] = (Math.random() * 2 - 1) * env;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 350;
      filter.Q.value = 0.8;
      const gain = ctx.createGain();
      const peak = Math.min(0.3, 0.06 + intensity * 0.24) * gainScale;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(peak, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(120, t);
      sub.frequency.exponentialRampToValueAtTime(45, t + dur);
      const subGain = ctx.createGain();
      subGain.gain.setValueAtTime(peak * 1.4, t);
      subGain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      // Sharp sheet-metal smack layered on the thump so a car-vs-car hit reads
      // as a proper collision instead of a muffled bump.
      const clickDur = 0.06;
      const clickLen = Math.floor(ctx.sampleRate * clickDur);
      const cb = ctx.createBuffer(1, clickLen, ctx.sampleRate);
      const cd = cb.getChannelData(0);
      for (let i = 0; i < clickLen; i++) {
        const env = Math.pow(1 - i / clickLen, 2.5);
        cd[i] = (Math.random() * 2 - 1) * env;
      }
      const clickSrc = ctx.createBufferSource();
      clickSrc.buffer = cb;
      const clickFilter = ctx.createBiquadFilter();
      clickFilter.type = 'bandpass';
      clickFilter.frequency.value = 2400;
      clickFilter.Q.value = 3.5;
      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(peak * 0.9, t);
      clickGain.gain.exponentialRampToValueAtTime(0.001, t + clickDur);
      clickSrc.connect(clickFilter);
      clickFilter.connect(clickGain);
      clickGain.connect(ctx.destination);
      clickSrc.start(t);
      clickSrc.stop(t + clickDur + 0.02);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      sub.connect(subGain);
      subGain.connect(ctx.destination);
      src.start(t);
      src.stop(t + dur + 0.05);
      sub.start(t);
      sub.stop(t + dur + 0.05);
    } catch { }
  }
  get engineLevel(): number { return this.getUpgradeLevel('engine'); }
  get tireLevel(): number { return this.getUpgradeLevel('tires'); }
  get suspLevel(): number { return this.getUpgradeLevel('suspension'); }
  get brakeLevel(): number { return this.getUpgradeLevel('brakes'); }
  get bodyLevel(): number { return this.getUpgradeLevel('body'); }
  get tireName(): string {
    const lvl = this.tireLevel;
    if (lvl >= 4) return 'HYPER';
    if (lvl >= 3) return 'SLICK';
    if (lvl >= 2) return 'RACE';
    if (lvl >= 1) return 'SPORT';
    return 'STOCK';
  }
  get engineName(): string {
    const lvl = this.engineLevel;
    if (lvl >= 5) return 'STAGE 5';
    if (lvl >= 4) return 'STAGE 4';
    if (lvl >= 3) return 'STAGE 3';
    if (lvl >= 2) return 'STAGE 2';
    if (lvl >= 1) return 'STAGE 1';
    return 'STOCK';
  }
  get suspName(): string {
    const lvl = this.suspLevel;
    if (lvl >= 3) return 'PRO';
    if (lvl >= 2) return 'RACE';
    if (lvl >= 1) return 'SPORT';
    return 'STOCK';
  }
  get brakeName(): string {
    const lvl = this.brakeLevel;
    if (lvl >= 3) return 'STAGE 3';
    if (lvl >= 2) return 'STAGE 2';
    if (lvl >= 1) return 'STAGE 1';
    return 'STOCK';
  }
  get bodyName(): string {
    const lvl = this.bodyLevel;
    if (lvl >= 2) return 'AERO';
    if (lvl >= 1) return 'CARBON';
    return 'STOCK';
  }
  get spoilerName(): string {
    const id = this.playerCar.spoilerId;
    if (id) {
      const part = APPEARANCE_PARTS.find(p => p.id === id && p.category === 'spoiler');
      if (part) return part.name.toUpperCase();
    }
    return 'STOCK';
  }
  get maxSpeedKmh(): number { return Math.round(this.getMaxSpeed() * 3.6); }
  calculatePrize(): number {
    const basePrize = this.selectedTrack?.prizePool || 300;
    const positionMultiplier = Math.max(0.1, 1 - (this.racePosition - 1) * 0.15);
    return Math.round(basePrize * positionMultiplier);
  }
  getPrizeBreakdown(track: TrackDefinition): { pos: number; label: string; amount: number }[] {
    const breakdown = [];
    for (let p = 1; p <= 5; p++) {
      const multiplier = Math.max(0.1, 1 - (p - 1) * 0.15);
      const amount = Math.round(track.prizePool * multiplier);
      const suffix = p === 1 ? 'st' : p === 2 ? 'nd' : p === 3 ? 'rd' : 'th';
      breakdown.push({ pos: p, label: `${p}${suffix}`, amount });
    }
    return breakdown;
  }
  getWinConditionText(track: TrackDefinition, isMultiplayer: boolean = false): string {
    return isMultiplayer
      ? `Complete ${track.laps} laps. First to finish wins! Race against other players online + 4 AI drivers.`
      : `Complete ${track.laps} laps. First to finish wins! Race against 4 AI drivers.`;
  }
  getMinimapRacers(): { name: string; pct: number; color: string; isPlayer: boolean; lap: number }[] {
    const td = this.renderer?.totalTrackDist || 1;
    const result: { name: string; pct: number; color: string; isPlayer: boolean; lap: number }[] = [];
    result.push({
      name: 'You',
      pct: ((this.carDist % td) / td) * 100,
      color: '#00e5ff',
      isPlayer: true,
      lap: this.currentLap,
    });
    for (const b of this.bots) {
      result.push({
        name: b.name,
        pct: ((b.dist % td) / td) * 100,
        color: '#e53935',
        isPlayer: false,
        lap: b.lap,
      });
    }
    for (const rc of this.remoteCars.values()) {
      result.push({
        name: rc.playerName,
        pct: ((rc.distance % td) / td) * 100,
        color: this.getPlayerColor(rc.connectionId),
        isPlayer: false,
        lap: rc.lap,
      });
    }
    return result;
  }
  showCallersTrackboard(id: number): boolean {
    return this.getTrackBoardUserLap(id) > 0 && !this.getTrackBoardVisibleRows(id).some(r => r.playerId === (this.parentRef?.user?.id ?? 0));
  }
  getTrackBoardGapForTrackId(id: number) {
    const raceResult = { lapTime: this.getTrackBoardUserLap(id) } as RaceResult;
    return this.getTrackBoardGap(raceResult, id);
  }
  hideLoginPopup() { this.parentRef?.closeOverlay(); }
  trackDefs: TrackDefinition[] = TRACKS as TrackDefinition[];
  /** Maps a track id to its environment theme (rendered by RacingRenderer). */
  private themeForTrack(trackId: number): 'miami' | 'mountain' | 'city' | 'default' | 'alpine' | 'desert' | 'monaco' | 'monaco-night' | 'montreal' | 'italy' | 'japan' {
    if (trackId === 1) return 'miami';
    if (trackId === 2) return 'mountain';
    if (trackId === 3) return 'city';
    if (trackId === 4) return 'alpine';
    if (trackId === 5) return 'desert';
    if (trackId === 6) return 'monaco';
    if (trackId === 7) return 'montreal';
    if (trackId === 8) return 'italy';
    if (trackId === 9) return 'monaco-night';
    if (trackId === 10) return 'japan';
    return 'default';
  }
  get UPGRADE_DEFS() { return UPGRADE_DEFS; }
  get CAR_SKINS() { return CAR_SKINS; }
  /** Returns a country flag emoji for the track based on its theme/location. */
  getTrackBestLap(trackId: number): number {
    const bests = this.playerCar?.bestLapsByTrack;
    return (bests && bests[trackId] > 0) ? bests[trackId] : 0;
  }
  getOverallBestLap(): number {
    return this.playerCar?.bestLap ?? 0;
  }
  /** Per-track top-5 paces for the garage RECORDS mini-tables (trackId → rows). */
  trackTopLaps: { [trackId: number]: RaceResult[] } = {};
  friendRecords: { userId: number; playerName: string; bestLapsByTrack: Record<number, number> }[] = [];
  friendsMode = false;
  friendsLoading = false;
  async openRecordsTab() {
    this.selectedTab = 'records';
    await this.loadAllTrackTopLaps();
  }
  async toggleFriendsMode() {
    this.friendsMode = !this.friendsMode;
    if (this.friendsMode && this.friendRecords.length === 0) {
      await this.loadFriendRecords();
    }
  }
  private async loadFriendRecords() {
    const uid = this.parentRef?.user?.id ?? 0;
    if (!uid) return;
    this.friendsLoading = true;
    try {
      this.friendRecords = await this.racingService.getFriendRecords(uid);
    } catch {
      this.friendRecords = [];
    } finally {
      this.friendsLoading = false;
    }
  }
  private async loadAllTrackTopLaps() {
    const uid = this.parentRef?.user?.id ?? 0;
    await Promise.all(this.trackDefs.map(async t => {
      try {
        const data = await this.racingService.getLeaderboard(t.id, uid);
        this.trackTopLaps[t.id] = (data?.results ?? []).slice(0, 5);
      } catch {
        this.trackTopLaps[t.id] = [];
      }
    }));
  }
  getTrackTopLaps(trackId: number): RaceResult[] {
    return this.trackTopLaps[trackId] || [];
  }
  getTrackFriendRows(trackId: number): { userId: number; playerName: string; lap: number; vsYou: string; ahead: boolean }[] {
    const myBest = this.getTrackBestLap(trackId);
    const rows: { userId: number; playerName: string; lap: number; vsYou: string; ahead: boolean }[] = [];
    for (const f of this.friendRecords) {
      const lap = f.bestLapsByTrack && f.bestLapsByTrack[trackId];
      if (!lap || lap <= 0) continue;
      let vsYou = '—';
      let ahead = false;
      if (myBest > 0) {
        const delta = lap - myBest;
        ahead = delta < 0;
        vsYou = ahead ? this.formatLapGap(delta) : (delta === 0 ? 'tie' : `+${(delta / 1000).toFixed(1)}s`);
      }
      rows.push({ userId: f.userId, playerName: f.playerName, lap, vsYou, ahead });
    }
    return rows.sort((a, b) => a.lap - b.lap);
  }
  getTrackFriendsBeaten(trackId: number): number {
    const myBest = this.getTrackBestLap(trackId);
    if (myBest <= 0) return 0;
    let count = 0;
    for (const f of this.friendRecords) {
      const lap = f.bestLapsByTrack && f.bestLapsByTrack[trackId];
      if (lap && lap > 0 && lap > myBest) count++;
    }
    return count;
  }
  getTrackTopLapGap(r: RaceResult, trackId: number): string {
    if (!r.lapTime || r.lapTime <= 0) return '';
    const rows = this.getTrackTopLaps(trackId);
    let leader = 0;
    for (const row of rows) {
      if (row.lapTime > 0 && (leader === 0 || row.lapTime < leader)) leader = row.lapTime;
    }
    if (leader <= 0) return '';
    if (r.lapTime <= leader) return 'PACE';
    return this.formatLapGap(r.lapTime - leader);
  }
  /** Fastest lap currently on the board (0 when nothing is recorded). */
  getLeaderboardLeaderLap(): number {
    let leader = 0;
    for (const r of this.leaderboard) {
      if (r.lapTime > 0 && (leader === 0 || r.lapTime < leader)) leader = r.lapTime;
    }
    return leader;
  }
  private formatLapGap(deltaMs: number): string {
    const sec = Math.abs(deltaMs) / 1000;
    const sign = deltaMs <= 0 ? '-' : '+';
    return `${sign}${sec.toFixed(1)}s`;
  }
  /** "+1.2s vs 1st · +0.4s vs your best" — how far off the pace a row is. */
  getLeaderboardGapText(r: RaceResult): string {
    if (!r.lapTime || r.lapTime <= 0) return '';
    const leader = this.getLeaderboardLeaderLap();
    const uid = this.parentRef?.user?.id ?? 0;
    const isMe = r.playerId === uid;
    const parts: string[] = [];
    if (leader > 0) {
      if (r.lapTime <= leader) parts.push('PACE');
      else parts.push(`${this.formatLapGap(r.lapTime - leader)} vs 1st`);
    }
    if (!isMe) {
      const myBest = this.getTrackBestLap(this.selectedTrack?.id ?? 1);
      if (myBest > 0) {
        if (r.lapTime > myBest) parts.push(`${this.formatLapGap(r.lapTime - myBest)} vs your best`);
        else if (r.lapTime < myBest) parts.push('faster than your best');
        else parts.push('ties your best');
      }
    }
    return parts.join(' · ');
  }
  getLeaderboardGapClass(r: RaceResult): string {
    if (!r.lapTime || r.lapTime <= 0) return '';
    const leader = this.getLeaderboardLeaderLap();
    if (leader > 0 && r.lapTime <= leader) return 'lb-gap-leader';
    const myBest = this.getTrackBestLap(this.selectedTrack?.id ?? 1);
    if (this.parentRef?.user?.id && r.playerId !== this.parentRef.user.id && myBest > 0 && r.lapTime < myBest) {
      return 'lb-gap-ahead';
    }
    return 'lb-gap-behind';
  }
  getTrackFlag(track: TrackDefinition): string {
    const flags: Record<number, string> = {
      1: '🇺🇸', 2: '🏔️', 3: '🏙️', 4: '🏔️', 5: '🇲🇦', 6: '🇲🇨', 7: '🇨🇦', 8: '🇮🇹', 9: '🌙', 10: '🇯🇵',
    };
    return flags[track.id] || '🏁';
  }
  /** Returns a CSS gradient background for the track card matching its theme. */
  getTrackCardBg(track: TrackDefinition): string {
    const bgs: Record<number, string> = {
      1: 'linear-gradient(135deg, #ff7e5f 0%, #feb47b 30%, #86a8e7 70%, #91eae4 100%)',
      2: 'linear-gradient(135deg, #2c3e50 0%, #3498db 40%, #87ceeb 100%)',
      3: 'linear-gradient(135deg, #0f0c29 0%, #302b63 40%, #24243e 100%)',
      4: 'linear-gradient(135deg, #1a1a2e 0%, #4a6fa5 30%, #b8d4e3 100%)',
      5: 'linear-gradient(135deg, #d4a373 0%, #e9c46a 40%, #f4a261 100%)',
      6: 'linear-gradient(135deg, #1a5276 0%, #2e86c1 30%, #85c1e9 70%, #f9e79f 100%)',
      7: 'linear-gradient(135deg, #1b4332 0%, #2d6a4f 30%, #52b788 70%, #a5d6a5 100%)',
      8: 'linear-gradient(135deg, #1a1a2e 0%, #6b1d1d 30%, #e74c3c 70%, #f39c12 100%)',
      9: 'linear-gradient(135deg, #020318 0%, #0b1030 35%, #1a2a5e 60%, #4a5fa8 100%)',
      10: 'linear-gradient(135deg, #17301f 0%, #2e5d3a 25%, #6f9e7f 55%, #cfe3d0 78%, #f2ead6 100%)',
    };
    return bgs[track.id] || 'linear-gradient(135deg, #2c3e50, #4ca1af)';
  }
}
