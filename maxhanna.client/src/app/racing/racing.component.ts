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
const TURN_SPEED = 0.55;
const OFF_TRACK_DRAG = 0.92;
const CURB_DRAG = 0.96; // red/white curb strips scrub speed (gentler than grass)
const AI_LOOKAHEAD = 3;

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
    userId: 0, upgrades: [], skinId: 1, spoilerId: 0, rimId: 0, exhaustId: 0, decalId: 0,
    totalRaces: 0, wins: 0, money: 500, bestLap: 0, totalEarnings: 0
  };
  carX = 0; carZ = 0; carYaw = 0; carSpeed = 0;
  carAccel = 0; carSteer = 0;
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
  private readonly joyRadius = 46; // px travel from center to full deflection (keeps thumb inside base)
  @ViewChild('joyThumb') joyThumbEl?: ElementRef<HTMLDivElement>;
  @ViewChild('joyZone') joyZoneEl?: ElementRef<HTMLDivElement>;
  keyboardSteerCurrent = 0; // Lerped value for smooth steering
  // Mobile pedal buttons — the virtual joystick only steers.
  gasHeld = false;
  brakeHeld = false;

  // ─── Leaderboard ───
  leaderboard: RaceResult[] = [];
  showLeaderboard = false;

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
  private _audioCtx: AudioContext | null = null;
  private _engineOsc: OscillatorNode | null = null;
  private _engineGain: GainNode | null = null;

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
          // Spawn bots to fill the grid alongside real players
          this.spawnBots(4);
          this.totalRacers = this.bots.length + this.lobbyPlayers.length;
          // Deduct entry fee for multiplayer
          if (this.selectedTrack) {
            this.playerCar.money -= this.selectedTrack.entryFee;
            this.saveCar();
          }
          this.addMessage('GO! GO! GO!');
        });
      })
    );

    this._mpSubs.push(
      this.racingHub.carPositionUpdate$.subscribe(data => {
        const existing = this.remoteCars.get(data.connectionId);
        if (existing) {
          const oldLap = existing.lap;
          const oldDist = existing.distance;
          existing.x = data.x;
          existing.z = data.z;
          existing.yaw = data.yaw;
          existing.speed = data.speed;
          existing.currentLap = data.currentLap;
          existing.isOffTrack = data.isOffTrack;
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
      this.racingHub.autoStartCountdown$.subscribe(remaining => {
        this.ngZone.run(() => {
          this.autoStartSeconds = remaining;
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
      if (e.code === 'KeyL') this.showLeaderboard = !this.showLeaderboard;
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
    // Leave lobby
    if (this._mpLobbyTrackId) {
      this.racingHub.leaveLobby(this._mpLobbyTrackId);
    }
    this.racingHub.disconnect();
    this._mpSubs.forEach(s => s.unsubscribe());
    // Clean up engine audio
    try {
      if (this._engineOsc) { this._engineOsc.stop(); this._engineOsc.disconnect(); }
      if (this._engineFilter) this._engineFilter.disconnect();
      if (this._engineGain) this._engineGain.disconnect();
      if (this._audioCtx) this._audioCtx.close();
    } catch { }
    document.removeEventListener('keydown', () => { });
    document.removeEventListener('keyup', () => { });
    this.renderer?.clearCache();
    this.remove_me("RacingComponent");
  }

  private async loadPlayerCar() {
    const userId = this.parentRef?.user?.id ?? 0;
    if (!userId) return;
    const car = await this.racingService.getPlayerCar(userId);
    if (car) this.playerCar = car;
    else {
      this.playerCar.userId = userId;
      this.playerCar.money = 500;
      this.playerCar.upgrades = [];
      this.playerCar.skinId = 1;
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
    this.selectedTrack = track;
    this.gameState = 'countdown';
    this.startRace(track);
  }

  selectTrackMultiplayer(track: TrackDefinition) {
    this.selectedTrack = track;
    this.showMultiplayer = true;
    this.joinLobby(track);
  }

  toggleMultiplayerTab() {
    this.showMultiplayer = !this.showMultiplayer;
    if (!this.showMultiplayer && this._mpLobbyTrackId) {
      this.racingHub.leaveLobby(this._mpLobbyTrackId);
      this._mpLobbyTrackId = '';
      this.lobbyPlayers = [];
      this.isLobbyHost = false;
      this.amReady = false;
      this.chatMessages = [];
    }
  }

  private async joinLobby(track: TrackDefinition) {
    const username = this.parentRef?.user?.username || 'Player';
    const userId = this.parentRef?.user?.id ?? 0;
    const tid = track.id.toString();
    this.trackIdStr = tid;
    this._mpLobbyTrackId = tid;

    const state = await this.racingHub.joinLobby(tid, username, userId);
    if (state) {
      this.lobbyPlayers = state.players;
      this.isLobbyHost = state.isHost;
      this.lobbyConnectionError = '';
      this.addMessage(`Joined multiplayer lobby for ${track.name}`);
    } else {
      this.lobbyConnectionError = 'Failed to join lobby. Try again.';
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

  async startRaceMP() {
    if (!this._mpLobbyTrackId || !this.isLobbyHost) return;
    this.countdownTimer = 4;
    this.gameState = 'countdown';
    await this.racingHub.startRace(this._mpLobbyTrackId);
  }

  async kickPlayer(connectionId: string) {
    if (!this.isLobbyHost) return;
    // Host-only — just leave is handled by the client, but we can log
    this.addMessage('Host can ask players to leave via chat.');
  }

  async sendChatMessage() {
    if (!this.chatInput.trim() || !this._mpLobbyTrackId) return;
    await this.racingHub.sendChat(this._mpLobbyTrackId, this.chatInput);
    this.chatMessages.push({ playerName: 'You', message: this.chatInput });
    if (this.chatMessages.length > 50) this.chatMessages.shift();
    this.chatInput = '';
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
    for (let i = 0; i < count; i++) {
      const offset = -5 - i * 4;
      const bp = this.renderer.getTrackPointAlong(((offset % this.renderer.totalTrackDist) + this.renderer.totalTrackDist) % this.renderer.totalTrackDist);
      // Spread bots across the track width so they don't all drive the centerline
      const laneOffsets = [0, 2.5, -2.5, 1.8, -1.8, 3];
      const laneOffset = laneOffsets[i % laneOffsets.length];
      const ppx = -bp.dirZ;
      const ppz = bp.dirX;
      // Mix of difficulty levels: first 2 hard, middle 2 medium, rest easy
      let config;
      if (i < 2) config = BOT_CONFIGS['hard'];
      else if (i < 4) config = BOT_CONFIGS['medium'];
      else config = BOT_CONFIGS['easy'];
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
      });
    }
  }

  private startRace(track: TrackDefinition) {
    const userId = this.parentRef?.user?.id ?? 0;
    if (!userId || !this.selectedTrack) return;

    this.totalLaps = track.laps;
    this.currentLap = 0;
    this.countdownTimer = 4;
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
    this.carDist = 0;

    // Create bots (always 4 — fills the grid in both single & multiplayer)
    this.spawnBots(4);
    this.totalRacers = 1 + this.bots.length;

    // Countdown
    this._countdownInterval = setInterval(() => {
      this.countdownTimer--;
      if (this.countdownTimer <= 0) {
        clearInterval(this._countdownInterval);
        this.ngZone.run(() => {
          this.gameState = 'racing';
          this.raceStartTime = performance.now();
          this.lapStartTime = this.raceStartTime;
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
      this.updateEngineAudio(dt);
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
      if (x !== 0) steerTarget = -x * 0.55;
    }

    // Pedal buttons (mobile) — independent of the steering stick
    if (this.gasHeld) gas = 1;
    if (this.brakeHeld) brake = 1;

    // Smoothly lerp toward target — slower attack so turning feels gradual,
    // not instantly maxed (users reported the car was too twitchy).
    const lerpSpeed = 6;
    this.keyboardSteerCurrent += (steerTarget - this.keyboardSteerCurrent) * Math.min(1, dt * lerpSpeed);
    if (Math.abs(this.keyboardSteerCurrent) < 0.002) this.keyboardSteerCurrent = 0;

    this.carAccel = gas - brake;
    this.carSteer = this.keyboardSteerCurrent;
  }

  private updatePhysics(dt: number) {
    const maxSpeed = this.getMaxSpeed();
    const grip = 0.85 + this.getGripBonus() / 100;
    const corner = 0.8 + this.getCornerBonus() / 100;
    const brakeForce = BRAKE_FORCE * (1 + this.getBrakeBonus() / 100);

    if (this.carAccel > 0) {
      this.carSpeed += ACCEL * (1 + this.getWeightBonus() / 200) * dt;
    } else if (this.carAccel < 0) {
      this.carSpeed -= brakeForce * dt;
    } else {
      this.carSpeed *= (1 - (1 - FRICTION) * dt * 60);
    }

    this.carSpeed = Math.max(-maxSpeed * 0.3, Math.min(maxSpeed, this.carSpeed));

    // Speed-sensitive turning: sharper at low speeds, dampened at high speeds
    // No turning when stationary (real car behavior)
    const speedRatio = Math.abs(this.carSpeed) / maxSpeed;
    const speedFactor = Math.min(1, Math.abs(this.carSpeed) / 3.0); // 0 at stop, 1 at ≥3 m/s
    const turnFactor = Math.max(0.28, 1 - speedRatio * speedRatio * 0.72);
    const steerAmount = this.carSteer * TURN_SPEED * turnFactor * speedFactor * corner * dt * 60;
    this.carYaw += steerAmount;

    if (Math.abs(this.carSteer) > 0.1 && Math.abs(this.carSpeed) > 20) {
      const slide = steerAmount * this.carSpeed * 0.02 * (1 - grip);
      this.carYaw -= slide * 0.5;
    }

    const dx = Math.sin(this.carYaw) * this.carSpeed * dt;
    const dz = Math.cos(this.carYaw) * this.carSpeed * dt;
    this.carX += dx;
    this.carZ += dz;

    const trackDist = this.renderer.getDistFromPoint(this.carX, this.carZ);
    const tp = this.renderer.getTrackPointAlong(trackDist);
    const expectedDir = Math.atan2(tp.dirX, tp.dirZ);

    // ── Wrong-way detection ──
    // Travel heading accounts for reversing (negative speed flips the car 180°).
    // The warning latches after ~0.7s of facing against the track flow and only
    // while moving, so a spin or a wall-scrape doesn't flash it.
    const travelHeading = this.carSpeed < 0 ? this.carYaw + Math.PI : this.carYaw;
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
    const barrierDist = halfWidth + 0.5; // barrier wall position

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

      // 2. Velocity vector
      const vx = Math.sin(this.carYaw) * this.carSpeed;
      const vz = Math.cos(this.carYaw) * this.carSpeed;
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
      const carRadius = 1.1; // car is ~1.3 wide, ~2.6 long — 2.2 center distance is realistic
      const minDist = carRadius * 2;

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

          // Relative velocity along collision normal
          const myVx = Math.sin(this.carYaw) * mySpeed;
          const myVz = Math.cos(this.carYaw) * mySpeed;
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
    if (Math.abs(this.carSteer) < 0.1) {
      let yawDiff = expectedDir - this.carYaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      if (Math.abs(yawDiff) > 0.15) {
        this.carYaw += Math.sign(yawDiff) * Math.min(Math.abs(yawDiff), 0.01);
      }
    }
  }

  private updateBots(dt: number) {
    for (const bot of this.bots) {
      const prevBotDist = bot.dist;
      const lookDist = bot.dist + AI_LOOKAHEAD * 5;
      const target = this.renderer.getTrackPointAlong(lookDist);

      const baseSpeed = bot.config.speedBase * (1 + this.getSpeedBonus() / 200);
      const maxBotSpeed = Math.min(baseSpeed + bot.config.speedVariance, this.getMaxSpeed() * 0.95);

      // Steer toward a point on the bot's OWN lane line (same lateral offset as
      // the lane snap below). Pointing at the bare centerline while the lane
      // snap drags the bot sideways made every bot visibly travel diagonally —
      // the rendered yaw no longer matched the true velocity direction.
      const tpx = -target.dirZ;
      const tpz = target.dirX;
      const tx = target.x + tpx * bot.laneOffset;
      const tz = target.z + tpz * bot.laneOffset;

      const dx = tx - bot.x;
      const dz = tz - bot.z;
      const targetYaw = Math.atan2(dx, dz);

      let yawDiff = targetYaw - bot.yaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

      bot.yaw += yawDiff * bot.config.cornerSkill * 0.1;

      const cornerSharpness = Math.abs(yawDiff);
      const cornerSlow = Math.max(0.4, 1 - cornerSharpness * 0.8);
      const targetSpeed = maxBotSpeed * cornerSlow * (1 - bot.config.mistakeChance * 0.3);

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

      const curTP = this.renderer.getTrackPointAlong(bot.dist);
      // Follow the bot's lane (lateral offset from centerline) with a soft snap.
      // The old hard 0.3 snap pinned every bot to the exact centerline.
      const ppx = -curTP.dirZ;
      const ppz = curTP.dirX;
      const laneX = curTP.x + ppx * bot.laneOffset;
      const laneZ = curTP.z + ppz * bot.laneOffset;
      const snap = 0.12;
      bot.x += (laneX - bot.x) * snap;
      bot.z += (laneZ - bot.z) * snap;

      // Lap crossing: distance wraps from the track end back to ~0.
      if (prevBotDist > this.renderer.totalTrackDist * 0.8 && bot.dist < this.renderer.totalTrackDist * 0.2) {
        bot.lap++;
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
    const allRacers: { dist: number; lap: number }[] = this.bots.map(b => ({
      dist: b.dist + b.lap * this.renderer.totalTrackDist,
      lap: b.lap
    }));

    // Add remote players
    this.remoteCars.forEach(rc => {
      allRacers.push({
        dist: rc.distance + rc.lap * this.renderer.totalTrackDist,
        lap: rc.lap
      });
    });

    allRacers.push({
      dist: this.carDist + this.currentLap * this.renderer.totalTrackDist,
      lap: this.currentLap
    });
    allRacers.sort((a, b) => b.lap - a.lap || b.dist - a.dist);
    this.racePosition = allRacers.findIndex(r =>
      r.dist === this.carDist + this.currentLap * this.renderer.totalTrackDist
    ) + 1;
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
    this.saveCar();

    // Save result to leaderboard
    const result: RaceResult = {
      position: this.racePosition,
      playerId: this.parentRef?.user?.id ?? 0,
      playerName: this.parentRef?.user?.username || 'Player',
      lapTime: this.bestLapTime || totalTime,
      totalTime: totalTime,
      moneyEarned: moneyEarned,
      isBot: !this._mpLobbyTrackId,
    };
    this.racingService.submitRaceResult(this.parentRef?.user?.id ?? 0, result);

    // Auto return to menu after 5s
    setTimeout(() => {
      if (this.gameState === 'finished') this.backToMenu();
    }, 5000);
  }

  async saveCar() {
    await this.racingService.savePlayerCar(this.playerCar);
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

  async buyUpgrade(u: any) {
    if (!this.canAffordUpgrade(u)) return;
    const userId = this.parentRef?.user?.id ?? 0;
    if (!userId) return;

    const result = await this.racingService.buyUpgrade(userId, u.id);
    if (result) {
      this.playerCar = result;
      this.addMessage(`Upgraded: ${u.name}!`);
    } else {
      this.playerCar.money -= u.cost;
      this.playerCar.upgrades.push({ ...u });
      this.saveCar();
      this.addMessage(`Upgraded: ${u.name}!`);
    }
  }

  // ─── Skins ───
  async selectSkin(skin: any) {
    if (!skin.owned) {
      if (this.playerCar.money < skin.cost) return;
      this.playerCar.money -= skin.cost;
      skin.owned = true;
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
    if (this.playerCar.money < part.cost) return;
    if (this.isAppearanceOwned(part)) {
      // Just equip it
      this.equipAppearance(part);
      return;
    }
    this.playerCar.money -= part.cost;
    part.owned = true;
    this.equipAppearance(part);
    this.saveCar();
    this.addMessage(`${part.name} installed!`);
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
  joyStart(e: TouchEvent | PointerEvent) {
    // Both touch* and pointer* handlers are bound; ignore the duplicate fired
    // right after pointerdown, and ignore a second finger landing mid-gesture.
    if (this.joyActive) return;
    const pt = this.joyPoint(e);
    if (!pt) return;
    this.joyActive = true;
    // Anchor the steering origin to the joystick base's REAL center on screen,
    // not to wherever the finger happened to land. The old code used the touch
    // point as origin, so touching right-of-center shifted the whole stick —
    // the deadzone plus that offset ate the left direction and made the car
    // feel like it could never turn left.
    const rect = this.joyZoneEl?.nativeElement?.getBoundingClientRect?.();
    if (rect && rect.width > 0 && rect.height > 0) {
      this.joyOriginX = rect.left + rect.width / 2;
      this.joyOriginY = rect.top + rect.height / 2;
    } else {
      this.joyOriginX = pt.clientX;
      this.joyOriginY = pt.clientY;
    }
    try { (e.target as HTMLElement)?.setPointerCapture?.((e as PointerEvent).pointerId); } catch { }
    this.joyMove(e); // snaps the thumb under the finger (dx = finger − base center)
    e.preventDefault();
  }

  joyMove(e: TouchEvent | PointerEvent) {
    if (!this.joyActive) return;
    const pt = this.joyPoint(e);
    if (!pt) return;
    let dx = pt.clientX - this.joyOriginX;
    let dy = 0; // steering-only stick — vertical travel disabled (gas/brake are buttons)
    const dist = Math.hypot(dx, dy);
    if (dist > this.joyRadius) {
      dx = (dx / dist) * this.joyRadius;
      dy = (dy / dist) * this.joyRadius;
    }
    this.joyX = Math.max(-1, Math.min(1, dx / this.joyRadius));
    this.joyY = Math.max(-1, Math.min(1, dy / this.joyRadius));
    // Move the thumb visually (clamped to the ring)
    if (this.joyThumbEl?.nativeElement) {
      this.joyThumbEl.nativeElement.style.transform =
        `translate(${dx}px, ${-dy}px)`;
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
      const t = e.touches[0];
      return { clientX: t.clientX, clientY: t.clientY };
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

  closeLoginPanel() {
    this.gameState = 'menu';
  }

  // ─── Engine Audio ───
  private _engineFilter: BiquadFilterNode | null = null;

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
      if (this._engineOsc) { this._engineOsc.stop(); this._engineOsc.disconnect(); }
      if (this._engineFilter) this._engineFilter.disconnect();
      if (this._engineGain) this._engineGain.disconnect();
      if (this._audioCtx) this._audioCtx.close();
    } catch { }
    this._engineOsc = null;
    this._engineFilter = null;
    this._engineGain = null;
    this._audioCtx = null;
  }

  private initEngineAudio() {
    try {
      this._audioCtx = new AudioContext();
      this._engineOsc = this._audioCtx.createOscillator();
      this._engineFilter = this._audioCtx.createBiquadFilter();
      this._engineGain = this._audioCtx.createGain();
      this._engineOsc.type = 'sawtooth';
      // Lowpass filter makes the engine a rumble instead of a harsh buzz
      this._engineFilter.type = 'lowpass';
      this._engineFilter.frequency.value = 500;
      this._engineFilter.Q.value = 0.7;
      this._engineGain.gain.value = 0.04;
      this._engineOsc.connect(this._engineFilter);
      this._engineFilter.connect(this._engineGain);
      this._engineGain.connect(this._audioCtx.destination);
      this._engineOsc.start();
    } catch { }
  }

  private updateEngineAudio(dt: number) {
    if (!this.soundOn || !this._audioCtx || !this._engineOsc || !this._engineFilter || !this._engineGain) return;
    const speed = Math.abs(this.carSpeed);
    const maxSpd = this.getMaxSpeed();
    const rpm = Math.max(0.3, Math.min(1.2, speed / maxSpd * 1.3 + 0.3));
    const freq = 55 + rpm * 120;
    this._engineOsc.frequency.setTargetAtTime(freq, this._audioCtx.currentTime, 0.05);
    this._engineFilter.frequency.setTargetAtTime(350 + rpm * 500, this._audioCtx.currentTime, 0.05);
    this._engineGain.gain.setTargetAtTime(0.02 + rpm * 0.03, this._audioCtx.currentTime, 0.05);
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

  get TRACKS() { return TRACKS; }
  get UPGRADE_DEFS() { return UPGRADE_DEFS; }
  get CAR_SKINS() { return CAR_SKINS; }
}
