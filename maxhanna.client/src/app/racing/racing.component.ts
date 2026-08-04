import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { RacingRenderer, TrackPoint } from './racing-renderer';
import { RacingService } from '../../services/racing.service';
import { RacingHubService, LobbyPlayer, RemoteCarPosition } from '../../services/racing-hub.service';
import {
  RacingPlayerCar, RaceResult, RacingAppearancePart,
  TRACKS, UPGRADE_DEFS, CAR_SKINS, BOT_CONFIGS, APPEARANCE_PARTS, TrackDefinition
} from '../../services/datacontracts/racing/racing-types';
import { UserEventService } from '../../services/user-event.service';
import { Subscription } from 'rxjs';

const ACCEL = 35;
const BRAKE_FORCE = 40;
const FRICTION = 0.97;
const MAX_SPEED_BASE = 55;
const TURN_SPEED = 0.38;
const OFF_TRACK_DRAG = 0.92;
const CURB_DRAG = 0.96; // red/white curb strips scrub speed (gentler than grass)

// ── Driving-sim grip model ──
// The nose (carYaw) turns with the steering rack; tire grip then redirects the
// car's momentum, so the TRAVEL direction (carDir) chases the nose. The tires
// can only push the car sideways so fast (LAT_ACCEL), so at speed the travel
// direction lags the nose — that gap is the slip angle. Overspeed a corner and
// the slip grows into a slide: the car arcs wide and scrubs speed, which is
// why braking before a corner now matters.
const LAT_ACCEL = 30;       // m/s² max lateral accel at 100% grip (≈3g)
const MAX_RACK_YAW = 2.6;   // rad/s nose turn rate at full lock (steering rack)
const SLIP_FULL = 0.45;     // rad of slip that counts as a full slide
const SLIP_DRAG = 1.8;      // 1/s speed bleed at full slide (tire scrub)
const SLIP_GRIP_CUT = 0.65; // how much a slide cuts remaining steering authority
const AI_LOOKAHEAD = 3;
const CAR_RADIUS = 1.1; // shared by player-vs-car and bot-vs-bot collision passes

interface BotCar {
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
  // Lateral offset from the track centerline — spreads bots across the road so
  // they don't all drive the exact same line (that caused constant collisions).
  laneOffset: number;
  // Monotonic distance traveled since the race started (starts at the bot's
  // negative grid offset). Unlike the wrapped `dist`, this never resets at the
  // line, so laps and race position stay correct for cars that start before it.
  raceDist: number;
  // Per-race pace multiplier (≈0.88–1.12). Randomized at spawn so the same two
  // cars don't dominate every race — each bot runs a slightly different speed.
  pace: number;
  // Sliding intensity 0..1 — feeds the distance-attenuated tire-screech audio
  // for this bot (estimated from yaw change + wall contact in updateBots).
  slide: number;
}

// One pooled "other car" audio voice — a compact engine synth + screech noise
// bus. The pool is sized to the max cars on track (bots + remote players) and
// each frame the loudest-attenuated cars are assigned to voices by distance.
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
  // Sliding intensity 0..1 — estimated from yaw change between position syncs,
  // used for distance-attenuated engine/screech audio for remote players.
  slide: number;
}

@Component({
  selector: 'app-racing',
  templateUrl: './racing.component.html',
  styleUrl: './racing.component.css',
  standalone: false,
})
export class RacingComponent extends ChildComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('raceCanvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;

  renderer!: RacingRenderer;
  private animId = 0;
  private lastTime = 0;
  isLoaded = false;

  // ─── Game State ───
  gameState: 'menu' | 'garage' | 'countdown' | 'racing' | 'paused' | 'finished' = 'menu';
  selectedTrack: TrackDefinition | null = null;
  selectedTab: 'menu' | 'upgrades' | 'skins' | 'appearance' = 'menu';
  currentLap = 0;
  totalLaps = 3;
  countdownTimer = 0;
  private _raceFinished = false;
  racePosition = 1;
  totalRacers = 1;

  // ─── Player Car ───
  playerCar: RacingPlayerCar = {
    userId: 0, playerName: '', upgrades: [], skinId: 1, spoilerId: 0, rimId: 0, exhaustId: 0, decalId: 0,
    totalRaces: 0, wins: 0, money: 500, bestLap: 0, totalEarnings: 0
  };
  carX = 0; carZ = 0; carYaw = 0; carSpeed = 0;
  carAccel = 0; carSteer = 0;
  // Driving-sim slip state: carDir = actual travel heading (rad), slipAngle = the
  // gap between the nose and the travel direction (0 = full grip).
  carDir = 0;
  slipAngle = 0;
  carDist = 0; lapTimes: number[] = [];
  // Previous frame's track distance — used to detect finish-line wrap-around.
  private lastCarDist = 0;
  lapStartTime = 0; lastLapTime = 0; raceStartTime = 0;
  totalRaceTime = 0; bestLapTime = 0;
  isOffTrack = false; offTrackTimer = 0;
  // Wrong-way detection: car heading vs. track tangent, latches only after
  // driving against the flow for a short time so spins/collisions don't flicker.
  wrongWay = false;
  private _wrongWayTimer = 0;
  private _wrongWayShown = false;
  // Wall contact state: used so speed is penalized once per impact instead of
  // every frame while scraping the wall (which caused visible bouncing).
  private _wasOnWall = false;
  // Car-to-car impact cooldown: the response fires once per collision, not every
  // frame of overlap (which drained speed and made the steering jitter wildly).
  private _carImpactCooldown = 0;
  // Bot-vs-bot impact-sound throttle: a sustained overlap fires one thud, not
  // one every frame (same idea as the player's _carImpactCooldown).
  private _botImpactCooldown = 0;

  // ─── Bots ───
  bots: BotCar[] = [];
  private _countdownInterval: any = null;

  // ─── Multiplayer ───
  showMultiplayer = false;
  lobbyPlayers: LobbyPlayer[] = [];
  isLobbyHost = false;
  amReady = false;
  trackIdStr = '';
  remoteCars: Map<string, RemoteCarVisual> = new Map();
  lobbyConnectionError = '';
  chatMessages: { playerName: string; message: string }[] = [];
  chatInput = '';
  autoStartSeconds = 0; // 2-min countdown display
  mpCountdownTimer = 0; // final 3-2-1-GO
  // Local countdown drivers: the server now broadcasts ONE authoritative start
  // timestamp (startTime) / auto-start remaining value, and the client ticks the
  // visible countdown locally from it — so a dropped tick message can never
  // freeze the lights or the "Auto-start in 2:00" display.
  private _mpStartCountdownTimer: any = null;
  private _mpRaceStartAt = 0;
  private _autoStartTicker: any = null;
  private autoStartDeadline = 0;
  private _mpSubs: Subscription[] = [];
  private _positionSyncTimer = 0;
  private _mpLobbyTrackId = '';
  private _mpFinished = false;

  // ─── Input ───
  keys = new Set<string>();
  isMobile = false;
  // Virtual joystick: x = steering (-1..1), y = gas/brake (-1..1, up is +)
  joyActive = false;
  joyX = 0;
  joyY = 0;
  private joyOriginX = 0;
  private joyOriginY = 0;
  private joyBaseCenterX = 0;
  private joyBaseCenterY = 0;
  private readonly joyRadius = 46; // px travel from grab point to full deflection
  private readonly joyThumbTravel = 48; // px the thumb can visually travel from base center (84 − 36)
  @ViewChild('joyThumb') joyThumbEl?: ElementRef<HTMLDivElement>;
  @ViewChild('joyZone') joyZoneEl?: ElementRef<HTMLDivElement>;
  keyboardSteerCurrent = 0; // Lerped value for smooth steering
  // Mobile pedal buttons — the virtual joystick only steers.
  gasHeld = false;
  brakeHeld = false;

  // ─── Leaderboard ───
  leaderboard: RaceResult[] = [];
  showLeaderboard = false;

  // True while the SignalR lobby connection is live (drives the lobby status dot).
  get hubConnected(): boolean { return this.racingHub.connected; }
  // The local player's SignalR connection id — used to tag "YOU" in the lobby roster.
  get myConnectionId(): string | null { return this.racingHub.myConnectionId; }
  // The name this player joined the lobby with (matches the server's playerName).
  get myLobbyName(): string {
    return this.playerCar.playerName?.trim() || this.parentRef?.user?.username || 'Player';
  }
  isMyChatMessage(c: { playerName: string; message: string }): boolean {
    return c.playerName === this.myLobbyName;
  }
  // How many players in the lobby have pressed READY — shown in the roster header.
  get readyCount(): number {
    return this.lobbyPlayers.filter(p => p.ready).length;
  }
  // Exposed for the podium template so we can tell multiplayer from offline.
  get isInMultiplayerRace(): boolean { return !!this._mpLobbyTrackId; }
  // True while a hub connection attempt is in flight (distinguishes "Connecting…" from "Not connected").
  mpConnecting = false;

  get mpStatusText(): string {
    if (this.hubConnected) return 'Connected';
    if (this.mpConnecting) return 'Connecting…';
    return 'Not connected';
  }

  // ─── Messages ───
  messages: string[] = [];
  private msgTimer: any = null;

  // ─── HUD ───
  hudSpeed = 0;
  hudRPM = 0;
  steerSmoothed = 0;
  @ViewChild('steerWheel') steerWheelEl?: ElementRef<HTMLDivElement>;
  @ViewChild('wheelSpeed') wheelSpeedEl?: ElementRef<HTMLDivElement>;
  @ViewChild('wheelRpm') wheelRpmEl?: ElementRef<HTMLDivElement>;
  @ViewChild('wheelGear') wheelGearEl?: ElementRef<HTMLDivElement>;

  // ─── Audio Engine ───
  // A layered synth instead of the old single sawtooth buzz: sub-octave sine
  // (rumble) + twin detuned saws (body) + 2× sawtooth (top-end rasp) through
  // an RPM-tracking lowpass whose cutoff gets a slow "combustion thrum" LFO,
  // plus a speed-scaled wind/road noise layer.
  private _audioCtx: AudioContext | null = null;
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
  // Crowd noise layer — bandpassed white noise that swells as the car passes
  // each grandstand (stands sit at 0/25/50/75% of the lap, mirroring
  // buildScenery in racing-renderer.ts).
  private _crowdSource: AudioBufferSourceNode | null = null;
  private _crowdFilter: BiquadFilterNode | null = null;
  private _crowdGain: GainNode | null = null;
  private static readonly GRANDSTAND_FRACS = [0, 0.25, 0.5, 0.75];
  private static readonly CROWD_REACH = 55; // world units of audible proximity

  // Tire screech — the player's own sliding. Bandpassed noise whose gain and
  // cutoff follow the slip-model slide intensity (0..1) set in updatePhysics.
  private _screechSource: AudioBufferSourceNode | null = null;
  private _screechFilter: BiquadFilterNode | null = null;
  private _screechGain: GainNode | null = null;
  // The player's current slide 0..1 — set every physics frame so the audio
  // update can read it without recomputing the slip model.
  private _playerSlide = 0;
  // Pooled voices for OTHER cars (bots + remote multiplayer players). Each
  // voice plays a quiet engine + screech, attenuated by straight-line distance
  // from the player so you only hear nearby cars over your own engine.
  private _remoteVoices: RemoteAudioVoice[] = [];
  private static readonly REMOTE_AUDIBLE = 55; // world units before a car is silent
  private static readonly MAX_REMOTE_VOICES = 10; // bots (up to ~9) + remote players

  // ─── Podium / Results ───
  podiumData: { playerName: string; totalTime: number; moneyEarned: number }[] = [];

  // ─── Speed Effects ───
  private _baseFov = 1.1;
  screenShake = 0;
  isRaining = false;

  // ─── Sound ───
  soundOn = false;

  constructor(
    private racingService: RacingService,
    private racingHub: RacingHubService,
    private userEventService: UserEventService,
    private ngZone: NgZone,
  ) { super(); }

  ngOnInit() {
    this.loadPlayerCar();
    try { this.soundOn = localStorage.getItem('gp_sound') === '1'; } catch { }
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
      this.racingHub.playerLeft$.subscribe(playerName => {
        this.ngZone.run(() => {
          this.lobbyPlayers = this.lobbyPlayers.filter(p => p.playerName !== playerName);
          // Also remove remote car
          this.remoteCars.forEach((v, k) => {
            if (v.playerName === playerName) this.remoteCars.delete(k);
          });
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
            this.gameState = 'countdown';
          }
        });
      })
    );

    this._mpSubs.push(
      this.racingHub.raceStarted$.subscribe(data => {
        this.ngZone.run(() => {
          this.totalLaps = data.totalLaps;
          const startAt = data.startTime;
          if (startAt && startAt > Date.now()) {
            // Future start: count the F1 lights down locally from the
            // authoritative server timestamp. 10s of lights, then go.
            this._mpRaceStartAt = startAt;
            this.countdownTimer = Math.max(0, Math.ceil((startAt - Date.now()) / 1000));
            this.gameState = 'countdown';
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
            // startTime already passed (or missing) — start immediately.
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
          // Slide estimate from yaw change between syncs (syncs arrive ~10Hz,
          // so a raw per-update yaw delta is too jumpy — smooth it toward the
          // new estimate instead of replacing it). Capture the previous yaw
          // BEFORE overwriting it with the incoming value.
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
          // Track lap from racing position (most reliable)
          if (data.currentLap > oldLap) existing.lap = data.currentLap;
          // Fallback: detect lap crossing from distance wrapping (only if currentLap didn't already increment)
          else if (data.distance < 50 && oldDist > 100) existing.lap++;
          existing.distance = data.distance;
        } else {
          // First time seeing this car — add it
          const player = this.lobbyPlayers.find(p => p.connectionId === data.connectionId);
          this.remoteCars.set(data.connectionId, {
            connectionId: data.connectionId,
            playerName: player?.playerName || '???',
            x: data.x, z: data.z, yaw: data.yaw,
            speed: data.speed, distance: data.distance,
            currentLap: data.currentLap, isOffTrack: data.isOffTrack,
            colorR: 0.9, colorG: 0.3, colorB: 0.3,
            lap: data.currentLap || 0,
            slide: 0,
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
          // Race is over for everyone — return to the lobby, ready to go again.
          this.lobbyPlayers = players;
          this.amReady = false;
          this.remoteCars.clear();
          this.messages = [];
          this.stopMpStartCountdown();
          this.stopAutoStartTicker();
          this.autoStartSeconds = 0;
          this.gameState = 'menu';
          this.showMultiplayer = true;
          this.addMessage('Rematch! Ready up to race again.');
        });
      })
    );

    this._mpSubs.push(
      this.racingHub.autoStartCountdown$.subscribe(remaining => {
        this.ngZone.run(() => {
          // Anchor a local deadline from the server value and tick it down
          // ourselves — the server only needs to send the initial value (and any
          // re-syncs), so a dropped tick can't freeze the "Auto-start in 2:00".
          this.autoStartSeconds = remaining;
          this.autoStartDeadline = Date.now() + remaining * 1000;
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
    this.renderer = new RacingRenderer(canvas);
    this.isLoaded = true;

    document.addEventListener('keydown', (e: KeyboardEvent) => {
      this.keys.add(e.code);
      if (e.code === 'KeyM' && this.gameState === 'racing') this.togglePause();
      if (e.code === 'KeyL') this.toggleLeaderboard();
    });
    document.addEventListener('keyup', (e: KeyboardEvent) => {
      this.keys.delete(e.code);
    });

    this.ngZone.runOutsideAngular(() => {
      this.lastTime = performance.now();
      this.gameLoop(this.lastTime);
    });

    // Init engine audio on first user interaction (only if sound is enabled)
    const initAudio = () => {
      if (this.soundOn && !this._audioCtx) this.initEngineAudio();
      document.removeEventListener('click', initAudio);
      document.removeEventListener('keydown', initAudio);
    };
    document.addEventListener('click', initAudio);
    document.addEventListener('keydown', initAudio);
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.animId);
    if (this._countdownInterval) clearInterval(this._countdownInterval);
    this.stopMpStartCountdown();
    this.stopAutoStartTicker();
    // Leave lobby
    if (this._mpLobbyTrackId) {
      this.racingHub.leaveLobby(this._mpLobbyTrackId);
    }
    this.racingHub.disconnect();
    this._mpSubs.forEach(s => s.unsubscribe());
    // Clean up engine audio
    this.stopEngineAudio();
    document.removeEventListener('keydown', () => { });
    document.removeEventListener('keyup', () => { });
    this.renderer?.clearCache();
    this.remove_me("RacingComponent");
  }

  private async loadPlayerCar() {
    const userId = this.parentRef?.user?.id ?? 0;
    if (!userId) return;
    const car = await this.racingService.getPlayerCar(userId);
    if (car) {
      this.playerCar = car;
      // Older saves have no name — default to the account username so the lobby
      // and leaderboard always show something friendly.
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
    // Seed the input with the current name so focusing + blurring without typing
    // never resets it (placeholder alone would let an empty blur wipe a custom name).
    this.playerNameDraft = this.playerCar.playerName || '';
    // Pre-load high scores so the menu board is ready the first time it's opened.
    this.loadLeaderboard();
  }

  // Gentler re-sync than loadPlayerCar: only adopts data when the server actually
  // returns a car, so a transient network failure during a purchase can't reset
  // the garage to a fresh default (money 500, no upgrades, default skin).
  private async refreshPlayerCarFromServer() {
    const userId = this.parentRef?.user?.id ?? 0;
    if (!userId) return;
    const car = await this.racingService.getPlayerCar(userId);
    if (car) {
      this.playerCar = car;
      if (!this.playerCar.playerName) {
        this.playerCar.playerName = this.parentRef?.user?.username || '';
      }
    }
  }

  getSpeedBonus(): number {
    let bonus = 0;
    for (const u of this.playerCar.upgrades) {
      if (u.category === 'engine') bonus += u.statBonus;
    }
    return bonus;
  }

  getGripBonus(): number {
    let bonus = 0;
    for (const u of this.playerCar.upgrades) {
      if (u.category === 'tires') bonus += u.statBonus;
    }
    return bonus;
  }

  getCornerBonus(): number {
    let bonus = 0;
    for (const u of this.playerCar.upgrades) {
      if (u.category === 'suspension') bonus += u.statBonus;
    }
    return bonus;
  }

  getBrakeBonus(): number {
    let bonus = 0;
    for (const u of this.playerCar.upgrades) {
      if (u.category === 'brakes') bonus += u.statBonus;
    }
    return bonus;
  }

  getWeightBonus(): number {
    let bonus = 0;
    for (const u of this.playerCar.upgrades) {
      if (u.category === 'body') bonus += u.statBonus;
    }
    return bonus;
  }

  getMaxSpeed(): number {
    return MAX_SPEED_BASE * (1 + this.getSpeedBonus() / 100) * (1 - this.getWeightBonus() / 200);
  }

  getSkinColor(): string {
    const skin = CAR_SKINS.find(s => s.id === this.playerCar.skinId) || CAR_SKINS[0];
    return skin.color;
  }

  getCarLabel(): string {
    const skin = CAR_SKINS.find(s => s.id === this.playerCar.skinId);
    return skin?.name || 'CUSTOM';
  }

  // ─── Menu ───
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
      // Opening the multiplayer panel should establish the SignalR connection
      // right away — previously nothing connected until a track was clicked, so
      // the status sat on "Connecting…" forever with zero network calls.
      await this.ensureHubConnection();
    }
    if (!this.showMultiplayer && this._mpLobbyTrackId) {
      this.racingHub.leaveLobby(this._mpLobbyTrackId);
      this._mpLobbyTrackId = '';
      this.lobbyPlayers = [];
      this.isLobbyHost = false;
      this.amReady = false;
      this.chatMessages = [];
      this.stopMpStartCountdown();
      this.stopAutoStartTicker();
      this.autoStartSeconds = 0;
    }
  }

  // Establishes the racing hub connection (idempotent) and tracks the in-flight
  // state so the lobby status can distinguish "Connecting…" from "Not connected".
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

    const state = await this.racingHub.joinLobby(tid, username, userId, track.laps);
    if (state) {
      this.lobbyPlayers = state.players;
      this.isLobbyHost = state.isHost;
      // The join response carries the current auto-start remaining so EVERY
      // player (host or not) sees the "Auto-start in 2:00" banner immediately —
      // previously only the host got it because newcomers waited on the next
      // group tick.
      if (state.autoStartRemaining && state.autoStartRemaining > 0) {
        this.autoStartSeconds = state.autoStartRemaining;
        this.autoStartDeadline = Date.now() + state.autoStartRemaining * 1000;
        this.startAutoStartTicker();
      }
      this.lobbyConnectionError = '';
      this.addMessage(`Joined multiplayer lobby for ${track.name}`);
    } else {
      this.lobbyConnectionError = 'Failed to join lobby. Try again.';
    }
  }

  // Retry joining the currently-selected track (the old retry re-joined TRACKS[0]
  // instead of the track the player actually picked).
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

  // ─── F1-style start lights ───
  // 10-second countdown with only red (10-8) and yellow (7-1) showing while
  // counting down; the green light only lights up at GO (0), together with red
  // and yellow, so green never appears before the race actually starts.
  get startLightPhase(): 'red' | 'yellow' | 'green' | 'go' {
    if (this.countdownTimer >= 8) return 'red';
    if (this.countdownTimer >= 1) return 'yellow';
    return 'go';
  }

  async startRaceMP() {
    if (!this._mpLobbyTrackId || !this.isLobbyHost) return;
    this.countdownTimer = 10;
    this.gameState = 'countdown';
    // The server broadcasts OnRaceStarted with a future startTime; raceStarted$
    // takes over the countdown from there. Don't start a local race here.
    await this.racingHub.startRace(this._mpLobbyTrackId, this.selectedTrack?.laps ?? 3);
  }

  // Clears the local start-light countdown timer (used for multiplayer races,
  // where the server broadcasts the authoritative start timestamp once).
  private stopMpStartCountdown() {
    if (this._mpStartCountdownTimer) {
      clearInterval(this._mpStartCountdownTimer);
      this._mpStartCountdownTimer = null;
    }
  }

  // Local fallback ticker for the 2-minute auto-start display. Anchored to a
  // deadline set from the server's remaining value, so the countdown keeps
  // ticking even if individual server ticks are dropped.
  private startAutoStartTicker() {
    if (this._autoStartTicker) clearInterval(this._autoStartTicker);
    this._autoStartTicker = setInterval(() => {
      const remain = Math.max(0, Math.ceil((this.autoStartDeadline - Date.now()) / 1000));
      this.autoStartSeconds = remain;
      if (remain <= 0 && this._autoStartTicker) {
        clearInterval(this._autoStartTicker);
        this._autoStartTicker = null;
      }
    }, 500);
  }

  private stopAutoStartTicker() {
    if (this._autoStartTicker) {
      clearInterval(this._autoStartTicker);
      this._autoStartTicker = null;
    }
  }

  // Shared race-start initialisation for multiplayer: called once the start
  // timestamp arrives (immediately, or after the local light countdown).
  private beginRace() {
    this.gameState = 'racing';
    this.raceStartTime = performance.now();
    this.lapStartTime = this.raceStartTime;
    this.currentLap = 0;
    this.bestLapTime = Infinity;
    this.carSpeed = 0;
    this.carDist = 0;
    this.lastCarDist = 0;
    this.racePosition = 1;
    this.lapTimes = [];
    this.lastLapTime = 0;
    this.totalRaceTime = 0;
    this.isOffTrack = false;
    this.offTrackTimer = 0;
    this.wrongWay = false;
    this._wrongWayTimer = 0;
    this._wrongWayShown = false;
    this.messages = [];
    this._raceFinished = false;
    this._mpFinished = false;
    // Place player at start
    const startP = this.renderer.getTrackPointAlong(0);
    this.carX = startP.x;
    this.carZ = startP.z;
    this.carYaw = Math.atan2(startP.dirX, startP.dirZ);
    this.carDir = this.carYaw;
    this.slipAngle = 0;
    // Apply the track's environment theme for the multiplayer race too.
    if (this.selectedTrack) {
      this.renderer.setTheme(this.themeForTrack(this.selectedTrack.id));
    }
    // Spawn bots to fill the grid alongside real players
    this.spawnBots(4);
    this.totalRacers = this.bots.length + this.lobbyPlayers.length;
    // Deduct entry fee for multiplayer
    if (this.selectedTrack) {
      this.playerCar.money -= this.selectedTrack.entryFee;
      this.saveCar();
    }
    this.playCrowdCheer();
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
    this._mpLobbyTrackId = '';
    this.lobbyPlayers = [];
    this.isLobbyHost = false;
    this.amReady = false;
    this.chatMessages = [];
    this.remoteCars.clear();
    this.selectedTrack = null;
    this.showMultiplayer = false;
    this.lobbyConnectionError = '';
  }

  async kickPlayer(connectionId: string) {
    if (!this.isLobbyHost) return;
    // Host-only — just leave is handled by the client, but we can log
    this.addMessage('Host can ask players to leave via chat.');
  }

  async sendChatMessage() {
    if (!this.chatInput.trim() || !this._mpLobbyTrackId) return;
    const message = this.chatInput;
    this.chatInput = '';
    // The hub broadcasts OnChatMessage back to EVERY client in the group
    // (including the sender), so we must NOT push the message locally here —
    // doing so made your own chat messages appear twice.
    await this.racingHub.sendChat(this._mpLobbyTrackId, message);
  }

  openGarage() {
    this.selectedTab = 'upgrades';
    this.gameState = 'garage';
  }

  backToMenu() {
    this.gameState = 'menu';
    this.selectedTab = 'menu';
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
    }
    this.showMultiplayer = false;
  }

  // ─── Garage Car 3D Rotation ───
  // Hero 3/4 view — tilted up and turned so the nose, sidepod and top deck
  // (wings, cockpit, airbox) all read at once. The car is now a real 3D model
  // with depth, so this angle shows off the volume instead of a flat sprite.
  carRotateX = 20;
  carRotateY = -40;
  isCarDragging = false;
  private _carDragStart: { x: number; y: number; rotX: number; rotY: number } | null = null;

  getCarTransform(): string {
    return `rotateX(${this.carRotateX}deg) rotateY(${this.carRotateY}deg)`;
  }

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
  }

  onCarPointerUp() {
    this._carDragStart = null;
    this.isCarDragging = false;
  }

  resetCarView() {
    this.carRotateX = 20;
    this.carRotateY = -40;
  }

  getPlayerColor(connectionId: string): string {
    const colors = ['#e53935', '#4a9eff', '#4caf50', '#ffd600', '#9c27b0', '#ff9800', '#00bcd4', '#e91e63'];
    const idx = this.lobbyPlayers.findIndex(p => p.connectionId === connectionId);
    return colors[Math.abs(idx) % colors.length];
  }

  // ─── Race ───
  private spawnBots(count: number) {
    this.bots = [];
    const botNames = ['Speed Racer', 'Lightning', 'Nitro', 'Tornado', 'Blitz', 'Storm', 'Vortex', 'Phantom'];

    // Shuffle the difficulty mix every race (2 hard, 2 medium, rest easy) so the
    // same two hard cars aren't always glued to the front row winning every time.
    // The pool is built then Fisher–Yates shuffled before assigning to grid slots.
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
      const offset = -5 - i * 4;
      const bp = this.renderer.getTrackPointAlong(((offset % this.renderer.totalTrackDist) + this.renderer.totalTrackDist) % this.renderer.totalTrackDist);
      // Spread bots across the track width so they don't all drive the centerline
      const laneOffsets = [0, 2.5, -2.5, 1.8, -1.8, 3];
      const laneOffset = laneOffsets[i % laneOffsets.length];
      const ppx = -bp.dirZ;
      const ppz = bp.dirX;
      const config = BOT_CONFIGS[diffPool[i]];
      this.bots.push({
        dist: ((offset % this.renderer.totalTrackDist) + this.renderer.totalTrackDist) % this.renderer.totalTrackDist,
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
        // Starts at the grid offset (e.g. -5, -9) so the finish line sits at 0 —
        // a bot that hasn't crossed it yet ranks behind the player on the line.
        raceDist: offset,
        // ±12% pace variance per race — breaks up the "always the same winner"
        // feel; even the hardest bot can have an off day.
        pace: 0.88 + Math.random() * 0.24,
        slide: 0,
      });
    }
  }

  private startRace(track: TrackDefinition) {
    const userId = this.parentRef?.user?.id ?? 0;
    if (!userId || !this.selectedTrack) return;

    this.totalLaps = track.laps;
    this.currentLap = 0;
    this.countdownTimer = 10;
    this.racePosition = 1;
    this.carSpeed = 0;
    this.carDist = 0;
    this.lastCarDist = 0;
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
    this.messages = [];
    this._raceFinished = false;
    this._mpFinished = false;

    // Place player at start
    const startP = this.renderer.getTrackPointAlong(0);
    this.carX = startP.x;
    this.carZ = startP.z;
    this.carYaw = Math.atan2(startP.dirX, startP.dirZ);
    this.carDir = this.carYaw;
    this.slipAngle = 0;
    this.carDist = 0;

    // Apply the track's environment theme (Miami / Mountain / City / default).
    this.renderer.setTheme(this.themeForTrack(track.id));

    // Create bots (always 4 — fills the grid in both single & multiplayer)
    this.spawnBots(4);
    this.totalRacers = 1 + this.bots.length;

    // Countdown — 10 seconds, then GO stays up for one full beat so the
    // player actually sees it before the race starts.
    this._countdownInterval = setInterval(() => {
      this.countdownTimer--;
      if (this.countdownTimer < 0) {
        clearInterval(this._countdownInterval);
        this.ngZone.run(() => {
          this.gameState = 'racing';
          this.raceStartTime = performance.now();
          this.lapStartTime = this.raceStartTime;
          this.playCrowdCheer();
        });
      }
    }, 1000);

    // Deduct entry fee
    this.playerCar.money -= track.entryFee;
    this.saveCar();
  }

  togglePause() {
    this.gameState = this.gameState === 'racing' ? 'paused' : 'racing';
  }

  private gameLoop(time: number) {
    this.animId = requestAnimationFrame((t) => this.gameLoop(t));
    const dt = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;

    if (this.gameState === 'racing') {
      this.processInput(dt);
    }

    if (this.gameState === 'racing') {
      this.updatePhysics(dt);
      this.updateBots(dt);
      this.checkLapCrossing();
      this.updateRacePosition();
      this.totalRaceTime += dt * 1000;
      // Speed effects: screen shake when off-track or hitting barriers
      if (this.isOffTrack) {
        this.screenShake = Math.min(0.04, this.screenShake + dt * 0.02);
      } else {
        this.screenShake *= 0.9;
      }

      // ── Sync position to multiplayer hub (10Hz) ──
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
          });
        }
      }
    }

    // Engine audio runs every frame (not just while racing) so the layered
    // synth can ease to idle when paused / in the menu / on the podium.
    this.updateEngineAudio();

    // Render
    if (this.renderer && this.isLoaded) {
      const aspect = this.canvasRef.nativeElement.width / this.canvasRef.nativeElement.height;
      const eyeY = 0.5; // F1 cockpit height
      const eyeX = this.carX;
      const eyeZ = this.carZ;
      const pitch = -0.05 + (this.carSpeed / this.getMaxSpeed()) * 0.03;
      const yaw = this.carYaw;
      const speedRatio = Math.abs(this.carSpeed) / this.getMaxSpeed();
      const fovZoom = 1.0 - speedRatio * 0.15;
      const shakeX = this.screenShake * (Math.random() - 0.5) * 2;
      const shakeY = this.screenShake * (Math.random() - 0.5) * 2;

      // Build car list from bots + remote players
      const carList = this.bots.map(b => {
        const colors = [
          [0.8, 0.2, 0.2], [0.2, 0.4, 0.9], [0.1, 0.7, 0.1],
          [0.9, 0.7, 0.1], [0.7, 0.2, 0.7], [1.0, 0.5, 0]
        ];
        const c = colors[b.color % colors.length];
        return { x: b.x, y: 0.1, z: b.z, yaw: b.yaw, r: c[0], g: c[1], b: c[2] };
      });

      // Add remote player cars
      this.remoteCars.forEach(rc => {
        carList.push({
          x: rc.x, y: 0.1, z: rc.z,
          yaw: rc.yaw,
          r: rc.colorR, g: rc.colorG, b: rc.colorB
        });
      });

      // Player car NOT rendered in first-person (camera is inside it)

      this.renderer.render(eyeX, eyeY, eyeZ, yaw, pitch, aspect, carList, dt, fovZoom, shakeX, shakeY, this.isRaining, speedRatio);

      this.hudSpeed = Math.abs(this.carSpeed * 3.6);
      this.hudRPM = Math.min(1, Math.abs(this.carSpeed) / this.getMaxSpeed() * 1.1);
      
      // Smooth steering wheel rotation (lerp toward target).
      // Negative sign: carSteer > 0 = turning left, and CSS rotate(-deg) swings the wheel
      // counter-clockwise (top of wheel to the left) — matching a real car's wheel.
      const targetSteer = -this.carSteer * 35;
      this.steerSmoothed += (targetSteer - this.steerSmoothed) * Math.min(1, dt * 8);
      
      // Direct DOM updates for smooth 60fps wheel animation (bypasses Angular CD)
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
    }
  }

  private processInput(dt: number) {
    let gas = 0, brake = 0, steerTarget = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) gas = 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) brake = 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) steerTarget = 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) steerTarget = -1;

    // Virtual joystick: steering only (horizontal axis). Gas/brake are the
    // separate pedal buttons. Deadzone prevents drift.
    if (this.joyActive) {
      const dz = 0.18;
      const x = Math.abs(this.joyX) > dz ? this.joyX : 0;
      // Invert: pushing the stick right (joyX > 0) must turn right. Keyboard
      // convention is left input = +1, so map joyX (right = +) to -steerTarget.
      // Scale below full deflection — joystick users found raw ±1 too twitchy.
      // (The steering response curve in processInput further softens center inputs.)
      if (x !== 0) steerTarget = -x * 0.7;
    }

    // Pedal buttons (mobile) — independent of the steering stick
    if (this.gasHeld) gas = 1;
    if (this.brakeHeld) brake = 1;

    // Smoothly lerp toward target — slow attack so the steering rack eases into
    // a turn like a real car instead of snapping to full lock (the old attack
    // was so fast the car felt like it was jerking from side to side).
    const lerpSpeed = 3.5;
    this.keyboardSteerCurrent += (steerTarget - this.keyboardSteerCurrent) * Math.min(1, dt * lerpSpeed);
    if (Math.abs(this.keyboardSteerCurrent) < 0.002) this.keyboardSteerCurrent = 0;

    // Non-linear steering response: inputs near center are scaled down so small
    // nudges give fine, gradual corrections, while full lock still reaches the
    // deep turn rate — this is what makes the car feel progressive like a real
    // steering wheel instead of on/off.
    const s = this.keyboardSteerCurrent;
    this.carSteer = Math.sign(s) * Math.pow(Math.abs(s), 1.35);

    this.carAccel = gas - brake;
  }

  private updatePhysics(dt: number) {
    const maxSpeed = this.getMaxSpeed();
    const grip = 0.85 + this.getGripBonus() / 100;
    const corner = 0.8 + this.getCornerBonus() / 100;
    const brakeForce = BRAKE_FORCE * (1 + this.getBrakeBonus() / 100);
    const speedAbs = Math.abs(this.carSpeed);

    // ── Steering + grip (driving-sim slip model) ──
    const speedRatio = speedAbs / maxSpeed;
    const speedFactor = Math.min(1, speedAbs / 3.0); // 0 at stop, 1 at ≥3 m/s
    const turnFactor = Math.max(0.28, 1 - speedRatio * speedRatio * 0.72);
    // Weight transfer: braking loads the front tires and adds front grip.
    const brakeGrip = this.carAccel < 0 ? 1.15 : 1.0;
    const weatherGrip = this.isRaining ? 0.72 : 1.0;
    const effGrip = grip * brakeGrip * weatherGrip;

    // Grip-limited yaw rate the tires can redirect at this speed (m/s² → rad/s).
    // Suspension (corner) scales the limit: better suspension = more cornering
    // grip, not just faster steering (which MAX_RACK_YAW would otherwise clamp).
    const maxYawRate = speedAbs > 0.5 ? (LAT_ACCEL * effGrip * (corner / 0.8)) / speedAbs : 99;
    // Steering rack turns the nose (a slide fades its authority — tires give way).
    const slidePrev = Math.min(1, Math.abs(this.slipAngle) / SLIP_FULL);
    const rackYawRate = this.carSteer * TURN_SPEED * turnFactor * speedFactor * corner * 60
      * (1 - SLIP_GRIP_CUT * slidePrev);
    const yawRate = Math.max(-MAX_RACK_YAW, Math.min(MAX_RACK_YAW, rackYawRate));

    if (this.carSpeed > 0.5) {
      // Nose responds to the rack; the travel direction chases it at the grip
      // limit, so momentum can't turn faster than the tires allow — the gap is
      // the slip angle (the arc).
      this.carYaw += yawRate * dt;
      let dirDiff = this.carYaw - this.carDir;
      while (dirDiff > Math.PI) dirDiff -= Math.PI * 2;
      while (dirDiff < -Math.PI) dirDiff += Math.PI * 2;
      const maxDirStep = maxYawRate * dt;
      this.carDir += Math.max(-maxDirStep, Math.min(maxDirStep, dirDiff));
    } else if (this.carSpeed < -0.5) {
      // Reversing: travel is opposite the nose; no slip to track.
      this.carDir = this.carYaw + Math.PI;
    } else {
      // Nearly stopped — nose and travel agree.
      this.carDir = this.carYaw;
    }

    // Slip angle + slide intensity (drives speed scrub and steering fade).
    // Only meaningful while moving forward — reversing/stopped set travel to the
    // nose (carDir = carYaw + PI) which would otherwise read as ±PI slip (a
    // full slide) and scrub speed whenever you reversed.
    let slip = 0;
    if (this.carSpeed > 0.5) {
      slip = this.carYaw - this.carDir;
      while (slip > Math.PI) slip -= Math.PI * 2;
      while (slip < -Math.PI) slip += Math.PI * 2;
    }
    this.slipAngle = slip;
    const slide = Math.min(1, Math.abs(slip) / SLIP_FULL);
    // Expose to the audio engine (tire screech follows the slip-model slide).
    this._playerSlide = slide;

    // ── Acceleration / braking / coast ──
    if (this.carAccel > 0) {
      // Traction: full power only when the tires are hooked up.
      const traction = 1 - 0.6 * slide;
      this.carSpeed += ACCEL * (1 + this.getWeightBonus() / 200) * traction * dt;
    } else if (this.carAccel < 0) {
      this.carSpeed -= brakeForce * dt;
    } else {
      this.carSpeed *= (1 - (1 - FRICTION) * dt * 60);
    }

    // Sliding scrubs speed — the reason you must brake before a corner.
    if (slide > 0.02) {
      this.carSpeed *= Math.exp(-SLIP_DRAG * slide * dt);
      this.screenShake = Math.max(this.screenShake, slide * 0.012);
    }

    this.carSpeed = Math.max(-maxSpeed * 0.3, Math.min(maxSpeed, this.carSpeed));

    // Movement follows the TRAVEL direction (the slide arc), not the nose.
    const travelYaw = this.carSpeed < 0 ? this.carYaw + Math.PI : this.carDir;
    const dx = Math.sin(travelYaw) * this.carSpeed * dt;
    const dz = Math.cos(travelYaw) * this.carSpeed * dt;
    this.carX += dx;
    this.carZ += dz;

    const trackDist = this.renderer.getDistFromPoint(this.carX, this.carZ);
    const tp = this.renderer.getTrackPointAlong(trackDist);
    const expectedDir = Math.atan2(tp.dirX, tp.dirZ);

    // ── Wrong-way detection ──
    // Travel heading accounts for reversing (negative speed flips the car 180°).
    // The warning latches after ~0.7s of facing against the track flow and only
    // while moving, so a spin or a wall-scrape doesn't flash it.
    const travelHeading = this.carDir; // carDir already encodes reversing (nose + PI)
    let headingDiff = travelHeading - expectedDir;
    while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
    while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
    const facingWrong = Math.abs(headingDiff) > Math.PI / 2 && Math.abs(this.carSpeed) > 3;
    if (facingWrong) this._wrongWayTimer += dt; else this._wrongWayTimer = 0;
    const wasWrong = this.wrongWay;
    this.wrongWay = this._wrongWayTimer > 0.7;
    if (this.wrongWay && !wasWrong && !this._wrongWayShown) {
      this._wrongWayShown = true;
      this.addMessage('⚠️ WRONG WAY! Turn around!');
    }
    if (!this.wrongWay && this._wrongWayShown) this._wrongWayShown = false;

    const dxTrack = this.carX - tp.x;
    const dzTrack = this.carZ - tp.z;
    const distFromCenter = Math.hypot(dxTrack, dzTrack);
    const halfWidth = (tp.width || 16) / 2;
    const barrierDist = halfWidth + 1.5; // barrier wall position (pushed back for the 3×-wider kerbs)

    // ── Curb strip slowdown ──
    // Red/white checkerboard strips sit on the floor from the track edge to the
    // wall base. Any wheel crossing onto them scrubs speed — a clear penalty,
    // but gentler than the off-track grass drag. The upper bound stops at the
    // wall-clamp position (barrierDist - 0.3) so scraping the wall doesn't also
    // stack the curb drag on top of the wall's impact response.
    const wheelReach = 0.5; // ~outer wheel/body extent from the car centreline
    if (distFromCenter > halfWidth - wheelReach && distFromCenter < barrierDist - 0.3 && Math.abs(this.carSpeed) > 1) {
      this.carSpeed *= Math.pow(CURB_DRAG, dt * 60); // frame-rate independent
      this.screenShake = Math.max(this.screenShake, 0.02);
    }

    // ── Barrier collision ──
    // Smooth, damped wall-follow. The car is eased against the barrier with a
    // CAPPED per-frame step (never teleports, even on deep penetration), the
    // yaw is BLENDED toward the tangent instead of snapping (no 90° launch),
    // and speed is lost proportional to how directly the car hits. Only the
    // first frame of contact applies the impact response.
    const onWall = distFromCenter > barrierDist;
    if (onWall) {
      const normX = dxTrack / distFromCenter;
      const normZ = dzTrack / distFromCenter;

      // 1. Soft position clamp — move toward the wall edge by at most 1.5 units
      //    per frame so a deep first-frame penetration eases out smoothly
      //    instead of teleporting the car (teleports = the "flying" feeling).
      const targetDist = barrierDist - 0.3;
      const toX = tp.x + normX * targetDist - this.carX;
      const toZ = tp.z + normZ * targetDist - this.carZ;
      const toLen = Math.hypot(toX, toZ);
      if (toLen > 0.0001) {
        const step = Math.min(toLen, 1.5);
        this.carX += (toX / toLen) * step;
        this.carZ += (toZ / toLen) * step;
      }

      // 2. Velocity vector — along the TRAVEL direction, so a sliding car hits
      //    the wall sideways with its real momentum, not its nose heading.
      const vx = Math.sin(this.carDir) * this.carSpeed;
      const vz = Math.cos(this.carDir) * this.carSpeed;
      const intoWall = vx * normX + vz * normZ;

      // 3. Wall tangent and along-wall velocity
      const tX = -normZ;
      const tZ = normX;
      const along = vx * tX + vz * tZ;

      // 4. Once per impact: damp the into-wall push and BLEND yaw toward the
      //    tangent. Speed retained scales with impact angle — a graze keeps
      //    almost all speed, a head-on loses most — and the yaw never snaps,
      //    so the car slides along the wall instead of launching off it.
      if (!this._wasOnWall && intoWall > 0) {
        const impactAngle = Math.abs(intoWall) / Math.max(0.01, Math.hypot(vx, vz));
        const retain = 1 - impactAngle * 0.7; // graze ~0.9, head-on ~0.3
        const targetYaw = Math.atan2(tX * (along >= 0 ? 1 : -1), tZ * (along >= 0 ? 1 : -1));
        let yawDiff = targetYaw - this.carYaw;
        while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
        while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
        this.carYaw += yawDiff * 0.4; // blend 40% on impact frame
        // Sync the travel direction too so momentum follows the wall instead of
        // spinning the car's path away from it.
        this.carDir += yawDiff * 0.4;
        this.slipAngle = this.carYaw - this.carDir;
        // Preserve the car's direction (forward/backward) through the impact
        this.carSpeed = Math.sign(this.carSpeed || 1) * Math.abs(along) * retain * 0.92; // extra friction on the crash frame
        this.screenShake = Math.max(0.04, Math.min(0.12, Math.abs(intoWall) / 300));
      }

      // 5. While in contact, gently nudge yaw toward the tangent so the car
      //    tracks curved walls — a small 6% blend that never fights the player.
      //    Gated on |along| so a scraping car at near-zero tangent speed can't
      //    ping-pong the 180°-flipped tangent target (no low-speed oscillation).
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

    // ── Car-to-car collision ──
    // Check against all bots and remote players (via remoteCars map). The old
    // code used a huge 4.0-unit min distance and applied random yaw jitter on
    // EVERY frame of overlap — that drained speed constantly and made steering
    // jitter wildly. Now: realistic radius, positional push-apart every frame,
    // but the speed/steering response fires ONCE per impact (0.3s cooldown).
    {
      const myX = this.carX, myZ = this.carZ, mySpeed = this.carSpeed;
      // car is ~1.3 wide, ~2.6 long — 2.2 center distance is realistic
      const minDist = CAR_RADIUS * 2;

      this._carImpactCooldown -= dt;

      // Collect nearby cars: bots + remote players (exclude self)
      const nearbyCars: { x: number; z: number; yaw: number; speed: number; isBot: boolean; ref: any }[] = [];
      for (const bot of this.bots) {
        if (!bot.alive) continue;
        nearbyCars.push({ x: bot.x, z: bot.z, yaw: bot.yaw, speed: bot.speed, isBot: true, ref: bot });
      }
      for (const [, rc] of this.remoteCars) {
        nearbyCars.push({ x: rc.x, z: rc.z, yaw: rc.yaw, speed: rc.speed, isBot: false, ref: rc });
      }

      for (const other of nearbyCars) {
        const dxC = myX - other.x;
        const dzC = myZ - other.z;
        const dist = Math.hypot(dxC, dzC);

        if (dist < minDist && dist > 0.01) {
          const pushX = dxC / dist;
          const pushZ = dzC / dist;
          const overlap = minDist - dist;
          // Cap the per-frame push so cars never teleport apart
          const push = Math.min(overlap, 0.6);

          // Push apart
          this.carX += pushX * push * 0.5;
          this.carZ += pushZ * push * 0.5;
          if (other.isBot) {
            other.ref.x -= pushX * push * 0.5;
            other.ref.z -= pushZ * push * 0.5;
          }

          // Relative velocity along collision normal — use travel direction so
          // a sliding car transfers its real momentum into the other car.
          const myVx = Math.sin(this.carDir) * mySpeed;
          const myVz = Math.cos(this.carDir) * mySpeed;
          const theirVx = Math.sin(other.yaw) * other.speed;
          const theirVz = Math.cos(other.yaw) * other.speed;
          const relV = (myVx - theirVx) * pushX + (myVz - theirVz) * pushZ;

          // Response only on the first frame of each impact — no per-frame jitter
          if (relV > 0 && this._carImpactCooldown <= 0) {
            this._carImpactCooldown = 0.3;
            const hit = Math.min(relV * 0.35, 8); // bounded speed loss
            this.carSpeed -= hit;
            if (other.isBot) other.ref.speed += hit * 0.3;
            // Tiny yaw nudge ONCE per impact, not every frame
            this.carYaw += (Math.random() - 0.5) * 0.02;
            if (other.isBot) other.ref.yaw += (Math.random() - 0.5) * 0.02;
            this.screenShake = Math.max(0.02, Math.min(0.08, relV * 0.01));
            // Impact thud — a fresh, short clunk that scales with closing speed.
            // relV/20 keeps a graze quiet and only a real shunt hits full volume.
            this.playImpactSound(Math.min(1, relV / 20), 1);
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

    this.carDist = trackDist;

    // Gentle track-alignment when not steering.
    // The old 0.05 correction per frame was so aggressive that the car snapped back to
    // track direction the instant the player released a key, making turning feel useless.
    // Now: only nudge when the car is > 0.15 rad off track, at 0.01 per frame.
    // Gate on the RAW input (keyboardSteerCurrent) — carSteer is the response-curved
    // value, so gating on it would let the straightener override gentle steering nudges.
    if (Math.abs(this.keyboardSteerCurrent) < 0.1) {
      let yawDiff = expectedDir - this.carYaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      if (Math.abs(yawDiff) > 0.15) {
        this.carYaw += Math.sign(yawDiff) * Math.min(Math.abs(yawDiff), 0.01);
        // Gently nudge the travel direction toward track flow too, so stale
        // slip decays naturally instead of snapping the car onto a new heading.
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
      const lookDist = bot.dist + AI_LOOKAHEAD * 5;
      const target = this.renderer.getTrackPointAlong(lookDist);

      // Pace variance (0.88–1.12) plus a pace-scaled cap: fast bots get a genuine
      // spread of top speeds instead of all tying at the same cap, so a different
      // car wins each race instead of the same two hard bots.
      const baseSpeed = bot.config.speedBase * bot.pace * (1 + this.getSpeedBonus() / 200);
      const maxBotSpeed = Math.min(baseSpeed + bot.config.speedVariance, this.getMaxSpeed() * 0.95 * (0.9 + bot.pace * 0.1));

      // ── Defensive driving (aggression) ──
      // When the player gets close — ahead, beside, or crawling up the inside —
      // the bot drifts toward the player's line to block, scaled by its
      // aggression stat. Contact is handled by the car-to-car collision below,
      // which slows the player down just like real racing. The swerve is blended
      // smoothly so bots don't snap onto the player like magnets.
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
        const across = pdxP * latX + pdzP * latZ; // + = player on the right
        const along = pdxP * fwdX + pdzP * fwdZ;  // + = player ahead
        const proximity = Math.max(0, 1 - playerDist / 10);
        if (Math.abs(along) < 8) {
          const side = Math.abs(across) > 0.8 ? Math.sign(across) : (Math.random() - 0.5);
          // NOTE: lat = (fwdZ, -fwdX) is the NEGATIVE of the lane-perpendicular
          // (-dirZ, dirX), so a player at across > 0 sits on the -perp side and
          // the bot must shift its lane by -side to move INTO the player.
          blockLane = -side * proximity * bot.config.aggression * 2.2;
        }
        // Player is directly on the bot's bumper — brake a little to defend.
        if (along < -1 && along > -6) defensiveBrake = 1 - bot.config.aggression * 0.25;
      }
      const effLane = bot.laneOffset + blockLane;

      // Steer toward a point on the bot's OWN (possibly shifted) lane line, same
      // lateral offset as the snap below so yaw matches the true velocity.
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

      bot.yaw += yawDiff * bot.config.cornerSkill * 0.1;
      // Lower-skill bots wobble more — the human-like imperfection that makes
      // them scrape walls and lose time instead of driving a perfect line.
      // Weighted by corner sharpness so straights stay clean while corners are
      // where they drift wide and hit the barriers.
      bot.yaw += (Math.random() - 0.5) * (1 - bot.config.cornerSkill) * 0.02 * (0.3 + cornerSharpness);

      const cornerSlow = Math.max(0.4, 1 - cornerSharpness * 0.8);
      const targetSpeed = maxBotSpeed * cornerSlow * defensiveBrake * (1 - bot.config.mistakeChance * 0.3);

      if (bot.mistakeTimer > 0) {
        bot.mistakeTimer -= dt;
        bot.speed *= 0.95;
      } else if (Math.random() < bot.config.mistakeChance * dt) {
        bot.mistakeTimer = 0.5 + Math.random() * 1;
      }

      bot.speed += (targetSpeed - bot.speed) * 0.1;
      bot.speed = Math.max(0, Math.min(maxBotSpeed, bot.speed));

      const bdx = Math.sin(bot.yaw) * bot.speed * dt;
      const bdz = Math.cos(bot.yaw) * bot.speed * dt;
      bot.x += bdx;
      bot.z += bdz;

      bot.dist = this.renderer.getDistFromPoint(bot.x, bot.z);

      // Slide estimate for audio: how fast the yaw is changing relative to
      // speed. Bots don't have a slip-angle model like the player, so yaw rate
      // is the best proxy — hard cornering at speed reads as tire slip. Wall
      // contact (below) also spikes it.
      const yawRate = Math.abs(bot.yaw - prevYaw) / Math.max(0.0001, dt);
      const speedFactor = Math.min(1, Math.abs(bot.speed) / 8);
      bot.slide = Math.min(1, (yawRate / 3.5) * speedFactor);

      const curTP = this.renderer.getTrackPointAlong(bot.dist);
      // Follow the bot's lane (lateral offset from centerline) with a soft snap.
      // Snap strength scales with skill: weak bots drift off line and into the
      // walls below; skilled bots hold a tight racing line.
      const ppx = -curTP.dirZ;
      const ppz = curTP.dirX;
      const laneX = curTP.x + ppx * effLane;
      const laneZ = curTP.z + ppz * effLane;
      const snap = 0.05 + bot.config.cornerSkill * 0.08;
      bot.x += (laneX - bot.x) * snap;
      bot.z += (laneZ - bot.z) * snap;

      // ── Bot wall & curb collisions ──
      // Bots can now genuinely hit the barriers: past the curb they scrub speed
      // on the checkerboard strips, and past the wall they get shoved back with
      // a speed hit and a yaw nudge — same treatment as the player.
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
      }

      // Lap tracking: accumulate a MONOTONIC race distance so the finish-line
      // wrap (dist 1199 → 0) doesn't confuse laps. The delta across the wrap is
      // corrected by adding the track length, keeping raceDist ever-increasing.
      // Old logic counted a lap on any high→low wrap, so a bot that started just
      // before the line "completed" a phantom lap after ~10 units — the player
      // then always ranked last because bots carried a free lap lead.
      let delta = bot.dist - prevBotDist;
      // Correct the finish-line wrap in BOTH directions (a collision can shove a
      // bot backward across the line, which must not count as a lap forward).
      if (delta < -this.renderer.totalTrackDist * 0.5) delta += this.renderer.totalTrackDist;
      else if (delta > this.renderer.totalTrackDist * 0.5) delta -= this.renderer.totalTrackDist;
      bot.raceDist += delta;
      bot.lap = Math.max(0, Math.floor(bot.raceDist / this.renderer.totalTrackDist));
    }

    // ── Bot-to-bot collisions ──
    // Bots bump each other the same way they bump the player: overlapping cars
    // get pushed apart, and hard contact scrubs speed + nudges yaw. This keeps
    // the pack from phasing through each other and creates the mid-race shuffle
    // (the old car-to-car pass only ever compared the PLAYER against cars).
    // The impact-sound throttle ticks every frame (not just during contact) so
    // two distinct shunts separated by a gap each fire their own thud, while a
    // sustained overlap still only thuds every 0.25s.
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
            a.speed *= 0.98;
            b.speed *= 0.98;
            a.yaw += (Math.random() - 0.5) * 0.08;
            b.yaw += (Math.random() - 0.5) * 0.08;
            // Hard contact → a distance-attenuated impact thud (throttled so a
            // sustained overlap doesn't fire one every frame).
            if (this._botImpactCooldown <= 0) {
              this._botImpactCooldown = 0.25;
              const mx = (a.x + b.x) * 0.5;
              const mz = (a.z + b.z) * 0.5;
              const dist = Math.hypot(mx - this.carX, mz - this.carZ);
              const reach = RacingComponent.REMOTE_AUDIBLE;
              const att = dist >= reach ? 0 : Math.pow(1 - dist / reach, 2);
              if (att > 0.02) this.playImpactSound(0.6, att * 0.5);
            }
          }
        }
      }
    }
  }

  private checkLapCrossing() {
    const prevDist = this.lastCarDist;
    const trackLen = this.renderer.totalTrackDist;

    // Crossing the line = distance wraps from near the track end back to ~0.
    // The old code aliased prevDist to the CURRENT value (impossible condition)
    // and compared backwards, so laps never advanced and the race could never end.
    if (prevDist > trackLen * 0.8 && this.carDist < trackLen * 0.2) {
      this.currentLap++;
      // Crowd roars a little louder on the final lap (finish) than regular laps.
      this.playCrowdCheer(this.currentLap >= this.totalLaps ? 1.4 : 1);
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
    // Rank every racer by MONOTONIC distance traveled past the finish line, so a
    // car that has crossed the line is always ahead of one that hasn't, regardless
    // of where the line sits in wrapped distance. Bots use their ever-increasing
    // raceDist (which starts at their negative grid offset); remote cars and the
    // player use lap × trackLen + wrapped dist. The player is located by marker,
    // not by exact-float equality (which could collide with a bot's value).
    const playerDist = this.currentLap * this.renderer.totalTrackDist + this.carDist;
    const allRacers: { dist: number; isPlayer: boolean }[] = this.bots.map(b => ({
      dist: b.raceDist,
      isPlayer: false
    }));

    // Add remote players
    this.remoteCars.forEach(rc => {
      allRacers.push({
        dist: rc.distance + rc.lap * this.renderer.totalTrackDist,
        isPlayer: false
      });
    });

    allRacers.push({ dist: playerDist, isPlayer: true });
    allRacers.sort((a, b) => b.dist - a.dist);
    const playerIdx = allRacers.findIndex(r => r.isPlayer);
    this.racePosition = playerIdx === -1 ? this.totalRacers : playerIdx + 1;
  }

  private finishRace() {
    if (this._raceFinished) return;
    this._raceFinished = true;

    // Notify multiplayer hub
    const totalTime = performance.now() - this.raceStartTime;
    if (this._mpLobbyTrackId && !this._mpFinished) {
      this._mpFinished = true;
      this.racingHub.finishRace(this._mpLobbyTrackId, this.racePosition, totalTime);
    }

    this.gameState = 'finished';

    // Calculate money earned
    const basePrize = this.selectedTrack?.prizePool || 300;
    const positionMultiplier = Math.max(0.1, 1 - (this.racePosition - 1) * 0.15);
    const moneyEarned = Math.round(basePrize * positionMultiplier);

    this.playerCar.totalRaces++;
    this.playerCar.totalEarnings += moneyEarned;
    if (this.racePosition === 1) {
      this.playerCar.wins++;
      this.addMessage(`🏆 YOU WIN! +$${moneyEarned}`);
    } else {
      this.addMessage(`Finished #${this.racePosition} of ${this.totalRacers} +$${moneyEarned}`);
    }
    this.playerCar.money += moneyEarned;

    // Persist a new personal best lap so it survives restarts and shows up in
    // the menu high-score strip (saved with the car via car/save).
    if (this.bestLapTime > 0 && this.bestLapTime < 99999999 &&
      (!this.playerCar.bestLap || this.bestLapTime < this.playerCar.bestLap)) {
      this.playerCar.bestLap = this.bestLapTime;
    }
    this.saveCar();

    // Save result to leaderboard
    const result: RaceResult = {
      position: this.racePosition,
      playerId: this.parentRef?.user?.id ?? 0,
      playerName: this.playerCar.playerName?.trim() || this.parentRef?.user?.username || 'Player',
      lapTime: this.bestLapTime || totalTime,
      totalTime: totalTime,
      moneyEarned: moneyEarned,
      isBot: !this._mpLobbyTrackId,
    };
    this.racingService.submitRaceResult(this.parentRef?.user?.id ?? 0, result);
    // Refresh the high-score board so the new time appears instantly.
    this.loadLeaderboard();
  }

  // ─── High Scores / Leaderboard ───
  // Fetches the fastest lap times from the server and displays them.
  async loadLeaderboard() {
    try {
      const trackId = this.selectedTrack?.id ?? 1;
      this.leaderboard = await this.racingService.getLeaderboard(trackId);
    } catch {
      this.leaderboard = [];
    }
  }

  async toggleLeaderboard() {
    this.showLeaderboard = !this.showLeaderboard;
    if (this.showLeaderboard) await this.loadLeaderboard();
  }

  async saveCar() {
    await this.racingService.savePlayerCar(this.playerCar);
  }

  // Player name input — trimmed, persisted with the car, and used for the lobby
  // and leaderboard instead of the account username.
  playerNameDraft = '';

  onPlayerNameInput(value: string) {
    this.playerNameDraft = value;
  }

  async savePlayerName() {
    const name = this.playerNameDraft.trim().slice(0, 40);
    this.playerNameDraft = name;
    // No-op when nothing changed (e.g. focus → blur without typing) so a custom
    // name isn't clobbered back to the account username.
    if (name === (this.playerCar.playerName || '')) return;
    this.playerCar.playerName = name || this.parentRef?.user?.username || '';
    await this.saveCar();
    this.addMessage(this.playerCar.playerName ? `Racer name set to ${this.playerCar.playerName}!` : 'Racer name cleared');
  }

  // ─── Upgrades ───
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

  // True while any garage purchase request is in flight — gates every buy path
  // so rapid clicks can't double-buy (the old code had no guard, and its local
  // fallback applied purchases even when the server rejected them, stacking
  // duplicate upgrades and money deductions).
  isBuying = false;
  // The upgrade currently being purchased — shows a spinner on just that card.
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
        // Server is authoritative: it validated funds, rejected duplicates and
        // deducted the cost — just adopt its state.
        this.playerCar = result;
        this.addMessage(`Upgraded: ${u.name}!`);
      } else {
        // Rejected (already owned / not enough money) or server unreachable.
        // Never apply the purchase locally — that's what let double-clicks and
        // rejected buys deduct twice. Re-sync to the server's truth instead.
        this.addMessage(`Couldn't buy ${u.name} — purchase rejected.`);
        await this.refreshPlayerCarFromServer();
      }
    } finally {
      this.isBuying = false;
      this.buyingUpgradeId = null;
    }
  }

  // ─── Skins ───
  async selectSkin(skin: any) {
    if (this.isBuying) return;
    const userId = this.parentRef?.user?.id ?? 0;
    if (!userId) return;

    if (!skin.owned) {
      // Route purchases through the server so it validates the cost and can
      // never let the balance go negative (the old client-only deduction could).
      this.isBuying = true;
      try {
        const result = await this.racingService.buySkin(userId, skin.id);
        if (result) {
          this.playerCar = result;
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
    this.saveCar();
    this.addMessage(`Skin changed to: ${skin.name}!`);
  }

  // ─── Appearance Parts ───
  getAppearanceParts(): RacingAppearancePart[] { return APPEARANCE_PARTS; }

  getAppearanceCategories(): { key: string; label: string; parts: RacingAppearancePart[] }[] {
    return [
      { key: 'spoiler', label: 'SPOILERS', parts: APPEARANCE_PARTS.filter(p => p.category === 'spoiler') },
      { key: 'rims', label: 'RIMS', parts: APPEARANCE_PARTS.filter(p => p.category === 'rims') },
      { key: 'exhaust', label: 'EXHAUST', parts: APPEARANCE_PARTS.filter(p => p.category === 'exhaust') },
      { key: 'decal', label: 'DECALS & WRAPS', parts: APPEARANCE_PARTS.filter(p => p.category === 'decal') },
    ];
  }

  getAppearancePreviewClass(p: RacingAppearancePart): string {
    if (p.id === 101) return 'prev-spoiler-carbon';
    if (p.id === 102) return 'prev-spoiler-dual';
    if (p.id === 103) return 'prev-spoiler-drs';
    if (p.id === 201) return 'prev-rim-alloy';
    if (p.id === 202) return 'prev-rim-deep';
    if (p.id === 203) return 'prev-rim-gold';
    if (p.id === 301) return 'prev-exhaust-sport';
    if (p.id === 302) return 'prev-exhaust-titanium';
    if (p.id === 401) return 'prev-decal-stripes';
    if (p.id === 402) return 'prev-decal-flame';
    if (p.id === 403) return 'prev-decal-carbon';
    if (p.id === 404) return 'prev-decal-number';
    return '';
  }

  getEquippedAppearance(cat: string): number {
    switch (cat) {
      case 'spoiler': return this.playerCar.spoilerId;
      case 'rims': return this.playerCar.rimId;
      case 'exhaust': return this.playerCar.exhaustId;
      case 'decal': return this.playerCar.decalId;
      default: return 0;
    }
  }

  isAppearanceOwned(part: RacingAppearancePart): boolean {
    return part.owned || this.getEquippedAppearance(part.category) === part.id;
  }

  async buyAppearancePart(part: RacingAppearancePart) {
    if (this.isBuying || this.playerCar.money < part.cost) return;
    if (this.isAppearanceOwned(part)) {
      // Just equip it
      this.equipAppearance(part);
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
    }
    this.saveCar();
  }

  getSpoilerStyle(): string {
    const id = this.playerCar.spoilerId;
    if (id === 101) return 'spoiler-carbon';
    if (id === 102) return 'spoiler-dual';
    if (id === 103) return 'spoiler-drs';
    return '';
  }

  getRimStyle(): string {
    const id = this.playerCar.rimId;
    if (id === 201) return 'rim-alloy';
    if (id === 202) return 'rim-deep';
    if (id === 203) return 'rim-gold';
    return '';
  }

  getExhaustStyle(): string {
    const id = this.playerCar.exhaustId;
    if (id === 301) return 'exhaust-sport';
    if (id === 302) return 'exhaust-titanium';
    return '';
  }

  getDecalStyle(): string {
    const id = this.playerCar.decalId;
    if (id === 401) return 'decal-stripes';
    if (id === 402) return 'decal-flame';
    if (id === 403) return 'decal-carbon';
    if (id === 404) return 'decal-number';
    return '';
  }

  // ─── Stat Preview (hover on upgrade) ───
  hoveredUpgrade: any = null;

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
      afterVal = Math.round(MAX_SPEED_BASE * (1 + tempBonus / 100) * (1 - this.getWeightBonus() / 200) * 3.6);
    }
    return { before: beforeVal, after: afterVal, label };
  }

  // ─── Mobile (virtual joystick) ───
  // FLOATING joystick: neutral is wherever the thumb grabs the stick, not the
  // exact pixel center of the base. On a phone your thumb never rests dead on
  // center, so a fixed stick anchored to the base center always feels offset
  // (rest 10px right → car drifts right). Here the stick "picks up" under the
  // finger and steering is displacement from that grab point — rest anywhere
  // and the car goes straight.
  joyStart(e: TouchEvent | PointerEvent) {
    // Both touch* and pointer* handlers are bound; ignore the duplicate fired
    // right after pointerdown, and ignore a second finger landing mid-gesture.
    if (this.joyActive) return;
    const pt = this.joyPoint(e);
    if (!pt) return;
    this.joyActive = true;
    const rect = this.joyZoneEl?.nativeElement?.getBoundingClientRect?.();
    if (rect && rect.width > 0 && rect.height > 0) {
      // Remember the base's visual center so we can clamp the thumb inside it.
      this.joyBaseCenterX = rect.left + rect.width / 2;
      this.joyBaseCenterY = rect.top + rect.height / 2;
    }
    // The steering neutral point = where the finger grabbed (floating origin).
    this.joyOriginX = pt.clientX;
    this.joyOriginY = pt.clientY;
    // Capture on the zone itself (not the touched child) so a finger sliding
    // off the thumb keeps driving the stick.
    try { this.joyZoneEl?.nativeElement?.setPointerCapture?.((e as PointerEvent).pointerId); } catch { }
    this.joyMove(e); // parks the thumb under the finger; input stays neutral
    e.preventDefault();
  }

  joyMove(e: TouchEvent | PointerEvent) {
    if (!this.joyActive) return;
    const pt = this.joyPoint(e);
    if (!pt) return;
    // Steering = displacement from the grab point (floating neutral). Clamp so
    // the full deflection is reached at the same thumb travel as before.
    let dx = pt.clientX - this.joyOriginX;
    const dist = Math.abs(dx);
    if (dist > this.joyRadius) dx = (dx / dist) * this.joyRadius;
    this.joyX = Math.max(-1, Math.min(1, dx / this.joyRadius));
    this.joyY = 0; // steering-only stick — vertical travel disabled (gas/brake are buttons)
    // Thumb visual: follows the finger, clamped to stay inside the visible base.
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

  gasDown() { this.gasHeld = true; }
  gasUp() { this.gasHeld = false; }
  brakeDown() { this.brakeHeld = true; }
  brakeUp() { this.brakeHeld = false; }

  private joyPoint(e: TouchEvent | PointerEvent): { clientX: number; clientY: number } | null {
    if (e instanceof TouchEvent) {
      if (e.touches.length === 0) return null;
      // With two thumbs (one on the joystick, one on a pedal) touches[0] may be
      // the OTHER finger — that would yank the stick to the pedal. Pick the
      // touch nearest the joystick's grab point instead.
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

  // ─── Helpers ───
  private addMessage(msg: string) {
    this.messages.push(msg);
    if (this.messages.length > 5) this.messages.shift();
    if (this.msgTimer) clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => this.messages = [], 4000);
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
    // 5 LEDs, filling green→amber→red as RPM climbs toward redline
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
  getAnalogNeedleDeg(): number {
    // -120deg to +120deg sweep over 0..1 RPM
    return -120 + Math.min(1, this.hudRPM) * 240;
  }

  closeLoginPanel() {
    this.gameState = 'menu';
  }

  // ─── Engine Audio ───

  toggleSound() {
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
      if (this._crowdGain) this._crowdGain.disconnect();
      if (this._screechSource) { try { this._screechSource.stop(); } catch { } this._screechSource.disconnect(); }
      if (this._screechFilter) this._screechFilter.disconnect();
      if (this._screechGain) this._screechGain.disconnect();
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
      if (this._audioCtx) this._audioCtx.close();
    } catch { }
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
    this._crowdGain = null;
    this._screechSource = null;
    this._screechFilter = null;
    this._screechGain = null;
    this._engineFilter = null;
    this._engineGain = null;
    this._audioCtx = null;
  }

  private initEngineAudio() {
    try {
      const ctx = new AudioContext();
      this._audioCtx = ctx;

      this._engineFilter = ctx.createBiquadFilter();
      this._engineFilter.type = 'lowpass';
      this._engineFilter.frequency.value = 600;
      this._engineFilter.Q.value = 0.8;

      this._engineGain = ctx.createGain();
      this._engineGain.gain.value = 0.06;
      this._engineFilter.connect(this._engineGain);
      this._engineGain.connect(ctx.destination);

      // Sub-octave sine — the deep thump that makes it feel like a V6
      this._subOsc = ctx.createOscillator();
      this._subOsc.type = 'sine';
      const subGain = ctx.createGain();
      subGain.gain.value = 0.5;
      this._subOsc.connect(subGain);
      subGain.connect(this._engineFilter);

      // Twin main saws, detuned a few cents apart — the fat engine body
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

      // Harmonic saw at 2× — the raspy top-end race note
      this._harmOsc = ctx.createOscillator();
      this._harmOsc.type = 'sawtooth';
      const harmGain = ctx.createGain();
      harmGain.gain.value = 0.12;
      this._harmOsc.connect(harmGain);
      harmGain.connect(this._engineFilter);

      // Slow LFO wobbling the filter cutoff — "combustion thrum" so the note
      // breathes instead of sounding like a flat constant tone
      this._thrumLfo = ctx.createOscillator();
      this._thrumLfo.type = 'sine';
      this._thrumLfo.frequency.value = 7;
      this._thrumLfoGain = ctx.createGain();
      this._thrumLfoGain.gain.value = 70;
      this._thrumLfo.connect(this._thrumLfoGain);
      this._thrumLfoGain.connect(this._engineFilter.frequency);

      // Wind / road noise — white noise through a bandpass that opens with speed
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

      // Crowd noise — bandpassed white noise started at zero gain; updateEngineAudio
      // raises it based on how close the car is to the nearest grandstand.
      const crowdLen = ctx.sampleRate * 2;
      const crowdBuf = ctx.createBuffer(1, crowdLen, ctx.sampleRate);
      const cdata = crowdBuf.getChannelData(0);
      for (let i = 0; i < crowdLen; i++) cdata[i] = Math.random() * 2 - 1;
      this._crowdSource = ctx.createBufferSource();
      this._crowdSource.buffer = crowdBuf;
      this._crowdSource.loop = true;
      this._crowdFilter = ctx.createBiquadFilter();
      this._crowdFilter.type = 'bandpass';
      this._crowdFilter.frequency.value = 1200;
      this._crowdFilter.Q.value = 0.6;
      this._crowdGain = ctx.createGain();
      this._crowdGain.gain.value = 0;
      this._crowdSource.connect(this._crowdFilter);
      this._crowdFilter.connect(this._crowdGain);
      this._crowdGain.connect(ctx.destination);

      // Tire screech — the player's own sliding. Bandpassed noise whose gain
      // and cutoff follow the slip-model slide (0..1) set each physics frame.
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

      // Pooled voices for OTHER cars (bots + remote players). Each voice is a
      // compact engine synth + screech bus; updateEngineAudio assigns the
      // nearest cars to voices each frame with distance-attenuated gain, so a
      // distant car is silent and a car right beside you is faintly audible
      // under your own engine.
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
      this._engineOsc.start();
      this._engineOsc2.start();
      this._harmOsc.start();
      this._thrumLfo.start();
      this._windSource.start();
      this._crowdSource.start();
    } catch { }
  }

  private updateEngineAudio() {
    if (!this.soundOn || !this._audioCtx || !this._engineOsc || !this._engineFilter || !this._engineGain) return;
    const t = this._audioCtx.currentTime;

    // Not racing (menu / pause / podium) — ease the engine down to a quiet idle
    // instead of freezing at the last racing RPM.
    if (this.gameState !== 'racing') {
      if (this._engineOsc) this._engineOsc.frequency.setTargetAtTime(70, t, 0.15);
      if (this._engineOsc2) this._engineOsc2.frequency.setTargetAtTime(70, t, 0.15);
      if (this._subOsc) this._subOsc.frequency.setTargetAtTime(35, t, 0.15);
      if (this._harmOsc) this._harmOsc.frequency.setTargetAtTime(140, t, 0.15);
      this._engineGain.gain.setTargetAtTime(0, t, 0.2);
      if (this._windGain) this._windGain.gain.setTargetAtTime(0, t, 0.2);
      if (this._crowdGain) this._crowdGain.gain.setTargetAtTime(0, t, 0.2);
      if (this._screechGain) this._screechGain.gain.setTargetAtTime(0, t, 0.1);
      for (const v of this._remoteVoices) {
        v.engineGain.gain.setTargetAtTime(0, t, 0.1);
        v.screechGain.gain.setTargetAtTime(0, t, 0.1);
      }
      return;
    }

    const speed = Math.abs(this.carSpeed);
    const maxSpd = this.getMaxSpeed();
    // RPM 0.3 (idle) → 1.25 (redline)
    const rpm = Math.max(0.3, Math.min(1.25, speed / maxSpd * 1.35 + 0.3));
    const baseFreq = 52 + rpm * 140; // fundamental ≈94–227 Hz
    if (this._subOsc) this._subOsc.frequency.setTargetAtTime(baseFreq * 0.5, t, 0.05);
    if (this._engineOsc) this._engineOsc.frequency.setTargetAtTime(baseFreq, t, 0.05);
    if (this._engineOsc2) this._engineOsc2.frequency.setTargetAtTime(baseFreq, t, 0.05);
    if (this._harmOsc) this._harmOsc.frequency.setTargetAtTime(baseFreq * 2, t, 0.05);
    // Open the filter with RPM so it snarls as you climb the rev range
    this._engineFilter.frequency.setTargetAtTime(350 + rpm * 900, t, 0.08);
    this._engineGain.gain.setTargetAtTime(0.04 + rpm * 0.05, t, 0.08);
    // Wind scales with speed² so it fades in naturally
    const speedRatio = Math.min(1, speed / maxSpd);
    if (this._windFilter) this._windFilter.frequency.setTargetAtTime(400 + speedRatio * 2200, t, 0.15);
    if (this._windGain) this._windGain.gain.setTargetAtTime(speedRatio * speedRatio * 0.05, t, 0.15);

    // ── Tire screech (player) ──
    // Gain follows the slip-model slide; cutoff rises too so a big slide reads
    // as a brighter, more aggressive squeal. Wall-scrapes also set slipAngle in
    // updatePhysics, so grinding the barrier squeals too.
    const slide = Math.min(1, this._playerSlide);
    if (this._screechGain) {
      this._screechGain.gain.setTargetAtTime(slide * 0.055, t, 0.05);
      if (this._screechFilter) this._screechFilter.frequency.setTargetAtTime(1800 + slide * 1800, t, 0.07);
    }

    // ── Other cars (bots + remote players) ──
    // Every other car on track gets a quiet engine + screech, attenuated by
    // straight-line distance from the player: nearby cars are faintly audible
    // under your own engine, distant cars are silent. The nearest cars claim
    // the pooled voices each frame; unclaimed voices mute.
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
          // 0 at reach, ~1 when right on top; squared curve so cars fade out
          // naturally instead of hitting a hard cutoff.
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

    // Crowd in the grandstands — swells as the car closes on the nearest stand
    // and fades once it's past. Circular distance on the wrapped lap position.
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
        const reach = RacingComponent.CROWD_REACH;
        const level = nearest >= reach ? 0 : (1 - nearest / reach) * 0.05;
        this._crowdGain.gain.setTargetAtTime(level, t, 0.1);
        if (this._crowdFilter) {
          this._crowdFilter.frequency.setTargetAtTime(900 + (level / 0.05) * 900, t, 0.15);
        }
      }
    }
  }

  // One-shot crowd cheer — a swelled, short noise burst used at race start and
  // when crossing the lap/finish line. A fresh buffer each call keeps it cheap;
  // the fast swell + exponential decay reads as a crowd reacting, not more wind.
  private playCrowdCheer(intensity = 1) {
    if (!this.soundOn || !this._audioCtx || this.gameState !== 'racing') return;
    try {
      const ctx = this._audioCtx;
      const t = ctx.currentTime;
      const dur = 2.2;
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      const src = ctx.createBufferSource();
      src.buffer = buf;

      // Brighter than the ambient babble — bandpass ~1.8kHz reads as cheering
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1800;
      filter.Q.value = 0.7;

      const gain = ctx.createGain();
      const peak = 0.14 * intensity;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(peak, t + 0.12);
      gain.gain.setValueAtTime(peak, t + 0.6);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start(t);
      src.stop(t + dur + 0.05);
    } catch { }
  }

  // One-shot car-to-car impact — a short, low thud built from bandpassed noise
  // plus a sub-sine thump. Intensity (0..1) scales loudness; gainScale lets
  // distant shunts fade to near-silence while your own bump stays punchy.
  private playImpactSound(intensity = 1, gainScale = 1) {
    if (!this.soundOn || !this._audioCtx || this.gameState !== 'racing') return;
    try {
      const ctx = this._audioCtx;
      const t = ctx.currentTime;
      const dur = 0.3;
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      // Burst of noise that decays fast — the "clunk" body of the hit.
      for (let i = 0; i < len; i++) {
        const env = Math.pow(1 - i / len, 3);
        d[i] = (Math.random() * 2 - 1) * env;
      }

      const src = ctx.createBufferSource();
      src.buffer = buf;

      // Bandpass ~300–400Hz keeps it a thud, not a screech.
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 350;
      filter.Q.value = 0.8;

      const gain = ctx.createGain();
      // Cap ~0.3 so a hard shunt reads as a punchy thud without drowning the
      // engine mix (which sits around 0.04–0.09).
      const peak = Math.min(0.3, 0.06 + intensity * 0.24) * gainScale;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(peak, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

      // A sub sine drops 120→45Hz for the low body impact.
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(120, t);
      sub.frequency.exponentialRampToValueAtTime(45, t + dur);
      const subGain = ctx.createGain();
      subGain.gain.setValueAtTime(peak * 1.4, t);
      subGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

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

  // ─── Cockpit / Dashboard Data ───
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

  // ─── Track-line minimap racer data ───
  getMinimapRacers(): { name: string; pct: number; color: string; isPlayer: boolean; lap: number }[] {
    const td = this.renderer?.totalTrackDist || 1;
    const result: { name: string; pct: number; color: string; isPlayer: boolean; lap: number }[] = [];

    // Player (cyan/blue dot)
    result.push({
      name: 'You',
      pct: ((this.carDist % td) / td) * 100,
      color: '#00e5ff',
      isPlayer: true,
      lap: this.currentLap,
    });

    // Bots (red dots)
    for (const b of this.bots) {
      result.push({
        name: b.name,
        pct: ((b.dist % td) / td) * 100,
        color: '#e53935',
        isPlayer: false,
        lap: b.lap,
      });
    }

    // Remote players (their colored dots)
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

  hideLoginPopup() { this.parentRef?.closeOverlay(); }
  trackDefs: TrackDefinition[] = TRACKS as TrackDefinition[];

  /** Maps a track id to its environment theme (rendered by RacingRenderer). */
  private themeForTrack(trackId: number): 'miami' | 'mountain' | 'city' | 'default' | 'alpine' | 'desert' | 'monaco' | 'montreal' | 'italy' {
    if (trackId === 1) return 'miami';
    if (trackId === 2) return 'mountain';
    if (trackId === 3) return 'city';
    if (trackId === 4) return 'alpine';
    if (trackId === 5) return 'desert';
    if (trackId === 6) return 'monaco';
    if (trackId === 7) return 'montreal';
    if (trackId === 8) return 'italy';
    return 'default';
  }
  get UPGRADE_DEFS() { return UPGRADE_DEFS; }
  get CAR_SKINS() { return CAR_SKINS; }

  /** Returns a country flag emoji for the track based on its theme/location. */
  getTrackFlag(track: TrackDefinition): string {
    const flags: Record<number, string> = {
      1: '🇺🇸', 2: '🏔️', 3: '🏙️', 4: '🏔️', 5: '🇲🇦', 6: '🇲🇨', 7: '🇨🇦', 8: '🇮🇹',
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
    };
    return bgs[track.id] || 'linear-gradient(135deg, #2c3e50, #4ca1af)';
  }
  
}
