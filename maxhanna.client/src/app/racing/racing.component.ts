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
const TURN_SPEED = 1.2;
const OFF_TRACK_DRAG = 0.92;
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
  lapStartTime = 0; lastLapTime = 0; raceStartTime = 0;
  totalRaceTime = 0; bestLapTime = 0;
  isOffTrack = false; offTrackTimer = 0;

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
  private _mpSubs: Subscription[] = [];
  private _positionSyncTimer = 0;
  private _mpLobbyTrackId = '';
  private _mpFinished = false;

  // ─── Input ───
  keys = new Set<string>();
  isMobile = false;
  mobileGas = false; mobileBrake = false;
  mobileLeft = false; mobileRight = false;
  keyboardSteerCurrent = 0; // Lerped value for smooth steering

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
          this.racePosition = 1;
          this.lapTimes = [];
          this.lastLapTime = 0;
          this.totalRaceTime = 0;
          this.isOffTrack = false;
          this.offTrackTimer = 0;
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
          else if (data.distance > 100 && oldDist < 50) existing.lap++;
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

  async startRaceMP() {
    if (!this._mpLobbyTrackId || !this.isLobbyHost) return;
    // Check all ready
    if (this.lobbyPlayers.some(p => !p.ready)) {
      this.addMessage('Waiting for all players to ready up...');
      return;
    }
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

  allPlayersReady(): boolean {
    return this.lobbyPlayers.length > 0 && this.lobbyPlayers.every(p => p.ready);
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
      // Mix of difficulty levels: first 2 hard, middle 2 medium, rest easy
      let config;
      if (i < 2) config = BOT_CONFIGS['hard'];
      else if (i < 4) config = BOT_CONFIGS['medium'];
      else config = BOT_CONFIGS['easy'];
      this.bots.push({
        dist: ((offset % this.renderer.totalTrackDist) + this.renderer.totalTrackDist) % this.renderer.totalTrackDist,
        speed: 0,
        yaw: Math.atan2(bp.dirX, bp.dirZ),
        x: bp.x, z: bp.z,
        lap: 0,
        name: botNames[i % botNames.length],
        color: i % 8,
        config,
        mistakeTimer: 0,
        hasMistake: false,
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
    this.lapTimes = [];
    this.lastLapTime = 0;
    this.raceStartTime = performance.now();
    this.lapStartTime = performance.now();
    this.totalRaceTime = 0;
    this.bestLapTime = Infinity;
    this.isOffTrack = false;
    this.offTrackTimer = 0;
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

      // Add player car
      carList.push({
        x: this.carX, y: 0.1, z: this.carZ,
        yaw: this.carYaw,
        r: 0.2, g: 0.5, b: 0.9
      });

      this.renderer.render(eyeX, eyeY, eyeZ, yaw, pitch, aspect, carList, dt, fovZoom, shakeX, shakeY, this.isRaining, speedRatio);

      this.hudSpeed = Math.abs(this.carSpeed * 3.6);
      this.hudRPM = Math.min(1, Math.abs(this.carSpeed) / this.getMaxSpeed() * 1.1);
      
      // Smooth steering wheel rotation (lerp toward target)
      const targetSteer = this.carSteer * 35;
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
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) steerTarget = -1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) steerTarget = 1;

    if (this.mobileGas) gas = 1;
    if (this.mobileBrake) brake = 1;

    // Unified smooth steering — both keyboard and mobile use lerp
    const mobileTarget = this.mobileLeft ? -1 : (this.mobileRight ? 1 : 0);
    const useMobile = mobileTarget !== 0;
    const effectiveTarget = useMobile ? mobileTarget * 0.4 : steerTarget; // mobile at 40% sensitivity

    // Smoothly lerp toward target (fast attack, prevents wild snapping)
    const lerpSpeed = 10; // builds up quickly but smoothly
    this.keyboardSteerCurrent += (effectiveTarget - this.keyboardSteerCurrent) * Math.min(1, dt * lerpSpeed);
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

    const dxTrack = this.carX - tp.x;
    const dzTrack = this.carZ - tp.z;
    const distFromCenter = Math.hypot(dxTrack, dzTrack);
    const halfWidth = (tp.width || 16) / 2;

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

    if (Math.abs(this.carSteer) < 0.1) {
      let yawDiff = expectedDir - this.carYaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      this.carYaw += yawDiff * 0.05;
    }
  }

  private updateBots(dt: number) {
    for (const bot of this.bots) {
      const lookDist = bot.dist + AI_LOOKAHEAD * 5;
      const target = this.renderer.getTrackPointAlong(lookDist);

      const baseSpeed = bot.config.speedBase * (1 + this.getSpeedBonus() / 200);
      const maxBotSpeed = Math.min(baseSpeed + bot.config.speedVariance, this.getMaxSpeed() * 0.95);

      const dx = target.x - bot.x;
      const dz = target.z - bot.z;
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
      const snap = 0.3;
      bot.x += (curTP.x - bot.x) * snap;
      bot.z += (curTP.z - bot.z) * snap;

      const prevDist = bot.dist;
      if (prevDist < this.renderer.totalTrackDist * 0.2 && bot.dist > this.renderer.totalTrackDist * 0.8) {
        bot.lap++;
      }
    }
  }

  private checkLapCrossing() {
    const prevDist = this.carDist;
    const trackLen = this.renderer.totalTrackDist;

    if (prevDist < trackLen * 0.2 && this.carDist > trackLen * 0.8) {
      this.currentLap++;
      const lapTime = performance.now() - this.lapStartTime;
      this.lapTimes.push(lapTime);
      this.lastLapTime = lapTime;

      if (lapTime < this.bestLapTime) this.bestLapTime = lapTime;
      if (this.currentLap > this.totalLaps) {
        this.finishRace();
      } else if (this.currentLap === this.totalLaps + 1) {
      } else {
        this.lapStartTime = performance.now();
        this.addMessage(`Lap ${this.currentLap}: ${(lapTime / 1000).toFixed(2)}s`);
      }
    }
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

  // ─── Mobile ───
  mobileAction(action: string, active: boolean) {
    switch (action) {
      case 'gas': this.mobileGas = active; break;
      case 'brake': this.mobileBrake = active; break;
      case 'left': this.mobileLeft = active; break;
      case 'right': this.mobileRight = active; break;
    }
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
