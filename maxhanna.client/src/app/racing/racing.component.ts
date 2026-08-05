import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { RacingRenderer, TrackPoint } from './racing-renderer';
import { RacingService } from '../../services/racing.service';
import { RacingHubService, LobbyPlayer, RemoteCarPosition, RaceStandingsRow } from '../../services/racing-hub.service';
import {
  RacingPlayerCar, RaceResult, RacingAppearancePart,
  TRACKS, UPGRADE_DEFS, CAR_SKINS, BOT_CONFIGS, APPEARANCE_PARTS, TrackDefinition,
  RIM_TINTS, DECAL_COLORS, GLOW_COLORS, ACCENT_COLORS, SKIN_FINISH_FACTOR, RacingCarAppearance
} from '../../services/datacontracts/racing/racing-types';
import { UserEventService } from '../../services/user-event.service';
import { Subscription } from 'rxjs';
const ACCEL = 35;
const BRAKE_FORCE = 40;
const FRICTION = 0.97;
const MAX_SPEED_BASE = 55;
const TURN_SPEED = 0.38;
const OFF_TRACK_DRAG = 0.92;
const CURB_DRAG = 0.96;
const LAT_ACCEL = 30;
const MAX_RACK_YAW = 2.6;
const SLIP_FULL = 0.45;
const SLIP_DRAG = 1.8;
const SLIP_GRIP_CUT = 0.65;
const AI_LOOKAHEAD = 3;
const CAR_RADIUS = 1.1;
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
  laneOffset: number;
  raceDist: number;
  pace: number;
  slide: number;
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
  gameState: 'menu' | 'garage' | 'countdown' | 'racing' | 'paused' | 'finished' = 'menu';
  selectedTrack: TrackDefinition | null = null;
  selectedTab: 'menu' | 'upgrades' | 'skins' | 'appearance' | 'records' = 'menu';
  currentLap = 0;
  totalLaps = 3;
  countdownTimer = 0;
  private _raceFinished = false;
  racePosition = 1;
  totalRacers = 1;
  playerCar: RacingPlayerCar = {
    userId: 0, playerName: '', upgrades: [], skinId: 1, spoilerId: 0, rimId: 0, exhaustId: 0, decalId: 0,
    glowId: 0, accentId: 0,
    totalRaces: 0, wins: 0, money: 500, bestLap: 0, totalEarnings: 0
  };
  carX = 0; carZ = 0; carYaw = 0; carSpeed = 0;
  carAccel = 0; carSteer = 0;
  carDir = 0;
  slipAngle = 0;
  carDist = 0; lapTimes: number[] = [];
  private lastCarDist = 0;
  lapStartTime = 0; lastLapTime = 0; raceStartTime = 0;
  totalRaceTime = 0; bestLapTime = 0;
  isOffTrack = false; offTrackTimer = 0;
  wrongWay = false;
  private _wrongWayTimer = 0;
  private _wrongWayShown = false;
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
  // Original total countdown duration (ms), captured when the deadline is set —
  // used as the depleting-bar denominator so the bar drains 100% -> 0% instead
  // of sawtoothing off the live ceil-refreshed autoStartSeconds.
  private _autoStartTotalMs = 0;
  private _mpSubs: Subscription[] = [];
  private _positionSyncTimer = 0;
  private _mpLobbyTrackId = '';
  private _mpFinished = false;
  // Guards the multiplayer winner celebration so the server's standings
  // announcement doesn't double-fire on the winner's own client (which already
  // celebrated at its line crossing). Reset per race (beginRace).
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
  // The track's current pace-setter lap (server-returned alongside userRank), so
  // the standings row can show "+1.2s behind 1st" without recomputing it.
  leaderboardBestLap = 0;
  // Rank movement since the user's previous race on this track (positive =
  // dropped N places, negative = climbed N). Persisted per track in localStorage.
  rankMovement = 0;
  // Racer profile popup (click a name on the leaderboard): the racer's car
  // (with the per-track best-lap breakdown) while it loads.
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
  // '🏆 New track record!' toast — old vs new time when a per-track best improves.
  recordToast: { old: number; new: number; trackId: number } | null = null;
  private _recordToastTimer: any = null;
  // '⚔️ Beat your best friend!' milestone toast — fires when a lap puts the
  // player ahead of their fastest friend on that track.
  beatFriendToast: { friendName: string; margin: number; trackId: number } | null = null;
  private _beatFriendToastTimer: any = null;
  private msgTimer: any = null;
  hudSpeed = 0;
  hudRPM = 0;
  steerSmoothed = 0;
  // Live current-lap elapsed time, refreshed every frame so the in-race HUD
  // pace readout (P+0.4s · +1.2s vs best) tracks mid-session.
  liveLapTime = 0;
  @ViewChild('steerWheel') steerWheelEl?: ElementRef<HTMLDivElement>;
  @ViewChild('wheelSpeed') wheelSpeedEl?: ElementRef<HTMLDivElement>;
  @ViewChild('wheelRpm') wheelRpmEl?: ElementRef<HTMLDivElement>;
  @ViewChild('wheelGear') wheelGearEl?: ElementRef<HTMLDivElement>;
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
  private _crowdSource: AudioBufferSourceNode | null = null;
  private _crowdFilter: BiquadFilterNode | null = null;
  private _crowdFilter2: BiquadFilterNode | null = null;
  private _crowdGain: GainNode | null = null;
  private _nextCrowdFxAt = 0;
  private static readonly GRANDSTAND_FRACS = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875];
  private static readonly CROWD_REACH = 55;
  // A "reaction moment" fires when the player roars past a grandstand at speed:
  // a short sharp crowd roar swell with a subtle Doppler pitch, synced to the
  // animated crowd cheering harder (renderer.exciteCrowd) for a few seconds.
  private static readonly STAND_ROAR_SPEED = 28;   // u/s — below this, no reaction
  private static readonly STAND_ROAR_COOLDOWN = 2200; // ms between reaction moments
  private _prevLapFrac = -1;      // lap fraction last frame (for frac-crossing detect)
  private _lastStandRoarAt = 0;   // timestamp of last grandstand reaction moment
  private _lastTickSecond = -1;   // last whole-second the garage tick played for
  private _lastStandingsTickSecond = -1; // last whole-second the standings tick played for
  // Per-car previous speeds for the brake-glow accel estimate.
  private _prevBotSpeeds = new Map<BotCar, number>();
  private _prevRemoteSpeeds = new Map<string, number>();
  // Integrated wheel-spin angles per car (radians). Spin is accumulated as
  // rate × dt so it advances smoothly with speed changes — passing the exact
  // same angle to every render pass keeps the mirror's own-car wheels in sync
  // with the main camera's (no frame-boundary jumps).
  private _botSpins = new Map<BotCar, number>();
  private _remoteSpins = new Map<string, number>();
  private _playerSpin = 0;
  private _screechSource: AudioBufferSourceNode | null = null;
  private _screechFilter: BiquadFilterNode | null = null;
  private _screechGain: GainNode | null = null;
  private _playerSlide = 0;
  private _remoteVoices: RemoteAudioVoice[] = [];
  private static readonly REMOTE_AUDIBLE = 55;
  private static readonly MAX_REMOTE_VOICES = 10;
  podiumData: { playerName: string; totalTime: number; moneyEarned: number }[] = [];
  // Full final standings shown on the results screen: every bot, remote player
  // and the local player ordered by total distance at the moment the race ended.
  finalStandings: { position: number; name: string; playerId: number; isBot: boolean; isPlayer: boolean; isDnf: boolean; color: string; laps: number }[] = [];
  // Authoritative lobby-wide classification, broadcast by the server once every
  // multiplayer racer has finished. Replaces the local finish-moment snapshot.
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
  // Remote players who dropped mid-race, kept on the board as DNF instead of
  // vanishing (the server broadcasts the same rows authoritatively).
  dnfRacers: { name: string; playerId: number; color: string }[] = [];
  private _baseFov = 1.1;
  screenShake = 0;
  isRaining = false;
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
          // A racer who drops mid-race is DNF, not dropped.
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
            // Auto-start fired while the player was browsing the garage — close
            // it so the start lights are front and center, never missed.
            this.closeGarageForRaceStart();
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
          // Auto-start (or the host) launched the race while the player was in
          // the garage — close the garage and launch so nobody misses the lights.
          this.closeGarageForRaceStart();
          if (startAt && startAt > Date.now()) {
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
    // Winner announcement — the server broadcasts it with the final standings,
    // so EVERY client celebrates the same winner at the same moment. The
    // winner's own client already fired the cannonade at their line crossing
    // (guarded by _mpWinnerCelebrated), so this mainly brings the celebration
    // to the rest of the lobby: finish-line burst + crowd frenzy for everyone.
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
            // Remote winner — finish-line burst + crowd frenzy only, no
            // rear-wing trail (that's anchored to the winner's own camera).
            // Also gated to an active race view so a late joiner catching the
            // standings doesn't get a celebration in the lobby.
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
    this.stopStandingsCountdown();
    if (this._mpLobbyTrackId) {
      this.racingHub.leaveLobby(this._mpLobbyTrackId);
    }
    this.racingHub.disconnect();
    this._mpSubs.forEach(s => s.unsubscribe());
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
      this.autoStartDeadline = 0;
      this._autoStartTotalMs = 0;
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
    const state = await this.racingHub.joinLobby(tid, username, userId, track.laps);
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
  // Depleting bar (100% -> 0%) for the garage auto-start countdown, mirroring
  // the standings window's progress treatment. Driven by the auto-start ticker
  // (500ms) so it drains smoothly without its own timer.
  get garageCountdownProgress(): number {
    if (this.autoStartDeadline <= 0) return 0;
    if (this.countdownTimer > 0) {
      // Pre-race lights countdown: 10 -> 0s
      return Math.max(0, Math.min(100, (this.countdownTimer / 10) * 100));
    }
    if (this.autoStartSeconds <= 0 || this._autoStartTotalMs <= 0) return 0;
    const remain = Math.max(0, this.autoStartDeadline - Date.now());
    return Math.max(0, Math.min(100, (remain / this._autoStartTotalMs) * 100));
  }
  // Urgent state for the garage auto-start bar — red + pulsing in the final
  // 3 seconds, mirroring the standings low-state treatment.
  get garageCountdownLow(): boolean {
    if (this.countdownTimer > 0) return this.countdownTimer <= 3;
    return this.autoStartSeconds > 0 && this.autoStartSeconds <= 3;
  }
  // Depleting bar under the start-lights countdown — drains 100% -> 0% as
  // the 10s pre-race countdown runs down, so players see the start draining.
  get countdownProgress(): number {
    return Math.max(0, Math.min(100, (this.countdownTimer / 10) * 100));
  }
  get startLightPhase(): 'red' | 'yellow' | 'green' | 'go' {
    if (this.countdownTimer >= 8) return 'red';
    if (this.countdownTimer >= 1) return 'yellow';
    return 'go';
  }
  // While a multiplayer lobby is counting down to start, the garage's return
  // button shows the live countdown so players never lose track of it.
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
    await this.racingHub.startRace(this._mpLobbyTrackId, this.selectedTrack?.laps ?? 3);
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
    // Snapshot the total once in case a tick runs before the handlers set it
    // (defensive — the handlers normally set _autoStartTotalMs already).
    if (this.autoStartDeadline > 0 && this._autoStartTotalMs <= 0) {
      this._autoStartTotalMs = Math.max(this.autoStartSeconds * 1000, 100);
    }
    this._autoStartTicker = setInterval(() => {
      const remain = Math.max(0, Math.ceil((this.autoStartDeadline - Date.now()) / 1000));
      this.autoStartSeconds = remain;
      // Subtle tick each second while in the garage, so a player ducked into
      // the upgrades can still hear the auto-start countdown running down.
      if (this.gameState === 'garage' && remain !== this._lastTickSecond) {
        this._lastTickSecond = remain;
        if (remain > 0) this.playCountdownTick(remain);
      }
      if (remain <= 0 && this._autoStartTicker) {
        clearInterval(this._autoStartTicker);
        this._autoStartTicker = null;
        // Safety net: the auto-start moment arrived. If the race-started
        // broadcast hasn't flipped us out of the garage yet, close it so the
        // upcoming lights are visible the instant they begin.
        if (this.gameState === 'garage' && this._mpLobbyTrackId) {
          this.closeGarageForRaceStart();
        }
      }
    }, 500);
  }
  // Alpine marmot alarm — two short shrill chirps sweeping up-down (the
  // classic whistling-marmot call), quiet and brief so it reads as wildlife
  // at the track edge rather than an alarm in the cockpit.
  private playMarmotWhistle() {
    if (!this.soundOn || !this._audioCtx) return;
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
  // Subtle one-second tick while in the garage with a lobby countdown running
  // — a quiet sine blip whose pitch rises for the final three seconds, so the
  // countdown is audible even mid-upgrade.
  private playCountdownTick(secondsLeft: number) {
    if (!this.soundOn || !this._audioCtx) return;
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
  // Louder rising 'GO' fanfare when the multiplayer race actually launches
  // (auto-start or host start), so a garage player can't miss the start.
  private playGoChime() {
    if (!this.soundOn || !this._audioCtx) return;
    try {
      const ctx = this._audioCtx;
      const t = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 rising triad
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
  private beginRace() {
    // Louder 'GO' fanfare the instant the multiplayer race launches — covers
    // both auto-start and host-start, and is audible even mid-garage.
    this.playGoChime();
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
    this.finalStandings = [];
    this.serverStandings = null;
    this.standingsCountdownText = '';
    this.stopStandingsCountdown();
    this.dnfRacers = [];
    this._raceFinished = false;
    this._mpFinished = false;
    this._mpWinnerCelebrated = false;
    const startP = this.renderer.getTrackPointAlong(0);
    this.carX = startP.x;
    this.carZ = startP.z;
    this.carYaw = Math.atan2(startP.dirX, startP.dirZ);
    this.carDir = this.carYaw;
    this.slipAngle = 0;
    if (this.selectedTrack) {
      this.renderer.setTheme(this.themeForTrack(this.selectedTrack.id));
    }
    this.spawnBots(4);
    this.totalRacers = this.bots.length + this.lobbyPlayers.length;
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
    this.showMultiplayer = false;
    this.lobbyConnectionError = '';
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
  }
  backToMenu() {
    this.gameState = 'menu';
    this.selectedTab = 'menu';
    // Leaving the garage while queued for a multiplayer lobby returns to the
    // lobby (connection intact) instead of bailing out to singleplayer.
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
    this.showMultiplayer = false;
  }
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
      const offset = -5 - i * 4;
      const bp = this.renderer.getTrackPointAlong(((offset % this.renderer.totalTrackDist) + this.renderer.totalTrackDist) % this.renderer.totalTrackDist);
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
        raceDist: offset,
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
    this.finalStandings = [];
    this.serverStandings = null;
    this.standingsCountdownText = '';
    this.stopStandingsCountdown();
    this.dnfRacers = [];
    this._raceFinished = false;
    this._mpFinished = false;
    this._mpWinnerCelebrated = false;
    const startP = this.renderer.getTrackPointAlong(0);
    this.carX = startP.x;
    this.carZ = startP.z;
    this.carYaw = Math.atan2(startP.dirX, startP.dirZ);
    this.carDir = this.carYaw;
    this.slipAngle = 0;
    this.carDist = 0;
    this.renderer.setTheme(this.themeForTrack(track.id));
    this.spawnBots(4);
    this.totalRacers = 1 + this.bots.length;
    this._countdownInterval = setInterval(() => {
      this.countdownTimer--;
      if (this.countdownTimer < 0) {
        clearInterval(this._countdownInterval);
        this.ngZone.run(() => {
          this.gameState = 'racing';
          this.raceStartTime = performance.now();
          this.lapStartTime = this.raceStartTime;
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
  private gameLoop(time: number) {
    this.animId = requestAnimationFrame((t) => this.gameLoop(t));
    const dt = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;
    if (this.gameState === 'racing') {
      this.processInput(dt);
    }
    if (this.gameState === 'finished' && this._raceFinished && this.racePosition === 1) {
      // Victory coast — the winner keeps rolling down the straight after the
      // line, shedding speed under friction, so the confetti trail streams off
      // the rear wing instead of the car stopping dead at the finish.
      const grip = 0.85 + this.getGripBonus() / 100;
      this.carSpeed -= 26 * grip * dt;
      if (this.carSpeed <= 0) this.carSpeed = 0;
      this.carX += Math.sin(this.carYaw) * this.carSpeed * dt;
      this.carZ += Math.cos(this.carYaw) * this.carSpeed * dt;
      // Let the car follow the road instead of ploughing into a wall.
      const cd = this.renderer.getDistFromPoint(this.carX, this.carZ);
      const tp = this.renderer.getTrackPointAlong(cd);
      const expected = Math.atan2(tp.dirX, tp.dirZ);
      let dh = this.carYaw - expected;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      this.carYaw += Math.max(-0.9 * dt, Math.min(0.9 * dt, dh * 1.2));
    }
    if (this.gameState === 'racing') {
      this.updatePhysics(dt);
      this.updateBots(dt);
      this.checkLapCrossing();
      this.updateRacePosition();
      this.totalRaceTime += dt * 1000;
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
          });
        }
      }
    }
    this.updateEngineAudio();
    // Alpine marmot alarms: play a whistle for each marmot the renderer
    // startled this frame (queued while a car drove past its burrow).
    if (this.renderer) {
      const whistles = this.renderer.consumeMarmotWhistle();
      for (let i = 0; i < whistles; i++) this.playMarmotWhistle();
    }
    if (this.renderer && this.isLoaded) {
      const aspect = this.canvasRef.nativeElement.width / this.canvasRef.nativeElement.height;
      const eyeY = 0.5;
      const eyeX = this.carX;
      const eyeZ = this.carZ;
      const pitch = -0.05 + (this.carSpeed / this.getMaxSpeed()) * 0.03;
      const yaw = this.carYaw;
      const speedRatio = Math.abs(this.carSpeed) / this.getMaxSpeed();
      const fovZoom = 1.0 - speedRatio * 0.15;
      const shakeX = this.screenShake * (Math.random() - 0.5) * 2;
      const shakeY = this.screenShake * (Math.random() - 0.5) * 2;
      // Accel estimate for the brake-glow flash: (speed - prevSpeed) / dt.
      // Signed — negative = decelerating (braking), which flares the discs.
      const accelFor = (obj: { speed: number }, prev: number) =>
        dt > 0 ? (obj.speed - prev) / dt : 0;
      // Wheel spin is INTEGRATED per car (rate × dt, clamped like the renderer's
      // old positional formula) so it advances smoothly through speed changes.
      // The same accumulated angle is passed to every render pass — the mirror
      // draws the player's own car with this exact value, keeping its wheels in
      // sync with the main camera's.
      const wheelRate = (spd: number) => Math.min(Math.abs(spd) / 0.17, 40) * (spd < 0 ? 1 : -1);
      // Deterministic per-car appearance so the grid looks alive: each bot/remote
      // picks a rim style, decal and accent from its grid index, and remote cars
      // hash their connection id so two remotes never match exactly.
      const botAppearance = (i: number, seed: number): RacingCarAppearance => {
        const rimIds = Object.keys(RIM_TINTS).map(Number);
        const decalIds = Object.keys(DECAL_COLORS).map(Number);
        const accentIds = Object.keys(ACCENT_COLORS).map(Number);
        const glowIds = Object.keys(GLOW_COLORS).map(Number);
        const hash = (i * 7 + seed * 13) & 0xffff;
        return {
          rimStyle: rimIds[(hash + i) % rimIds.length],
          decalStyle: decalIds[(hash * 3 + i) % decalIds.length],
          accent: ACCENT_COLORS[accentIds[(hash + i * 2) % accentIds.length]],
          glow: (hash + i) % 5 === 0 ? GLOW_COLORS[glowIds[(hash + i) % glowIds.length]] : undefined,
          metallic: 0.3 + ((hash + i * 3) % 6) / 10,
        };
      };
      const carList = this.bots.map((b, i) => {
        const colors = [
          [0.8, 0.2, 0.2], [0.2, 0.4, 0.9], [0.1, 0.7, 0.1],
          [0.9, 0.7, 0.1], [0.7, 0.2, 0.7], [1.0, 0.5, 0]
        ];
        const c = colors[b.color % colors.length];
        const prev = this._prevBotSpeeds.get(b) ?? b.speed;
        this._prevBotSpeeds.set(b, b.speed);
        const spin = (this._botSpins.get(b) ?? 0) + wheelRate(b.speed) * dt;
        this._botSpins.set(b, spin);
        return {
          x: b.x, y: 0.1, z: b.z, yaw: b.yaw, r: c[0], g: c[1], b: c[2], speed: b.speed, accel: accelFor(b, prev), spin, slide: b.slide,
          id: 'b' + i, // stable id for per-car renderer state (brake heat)
          ...botAppearance(i, b.color)
        };
      });
      this.remoteCars.forEach((rc) => {
        const prev = this._prevRemoteSpeeds.get(rc.connectionId) ?? rc.speed;
        this._prevRemoteSpeeds.set(rc.connectionId, rc.speed);
        const spin = (this._remoteSpins.get(rc.connectionId) ?? 0) + wheelRate(rc.speed) * dt;
        this._remoteSpins.set(rc.connectionId, spin);
        const seed = rc.connectionId.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0);
        const i = seed % 1000;
        carList.push({
          x: rc.x, y: 0.1, z: rc.z,
          yaw: rc.yaw,
          r: rc.colorR, g: rc.colorG, b: rc.colorB,
          speed: rc.speed,
          accel: accelFor(rc, prev),
          spin,
          slide: rc.slide,
          id: 'r' + rc.connectionId, // stable id for per-car renderer state (brake heat)
          ...botAppearance(i, seed)
        });
      });
      this._playerSpin += wheelRate(this.carSpeed) * dt;
      this.renderer.render(eyeX, eyeY, eyeZ, yaw, pitch, aspect, carList, dt, fovZoom, shakeX, shakeY, this.isRaining, speedRatio, this.carSpeed, this.carAccel, this._playerSpin, this._playerSlide, this.getPlayerAppearance());
      this.hudSpeed = Math.abs(this.carSpeed * 3.6);
      this.hudRPM = Math.min(1, Math.abs(this.carSpeed) / this.getMaxSpeed() * 1.1);
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
    const corner = 0.8 + this.getCornerBonus() / 100;
    const brakeForce = BRAKE_FORCE * (1 + this.getBrakeBonus() / 100);
    const speedAbs = Math.abs(this.carSpeed);
    const speedRatio = speedAbs / maxSpeed;
    const speedFactor = Math.min(1, speedAbs / 3.0);
    const turnFactor = Math.max(0.28, 1 - speedRatio * speedRatio * 0.72);
    const brakeGrip = this.carAccel < 0 ? 1.15 : 1.0;
    const weatherGrip = this.isRaining ? 0.72 : 1.0;
    const effGrip = grip * brakeGrip * weatherGrip;
    const maxYawRate = speedAbs > 0.5 ? (LAT_ACCEL * effGrip * (corner / 0.8)) / speedAbs : 99;
    const slidePrev = Math.min(1, Math.abs(this.slipAngle) / SLIP_FULL);
    const rackYawRate = this.carSteer * TURN_SPEED * turnFactor * speedFactor * corner * 60
      * (1 - SLIP_GRIP_CUT * slidePrev);
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
      this.carSpeed += ACCEL * (1 + this.getWeightBonus() / 200) * traction * dt;
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
      this.addMessage('⚠️ WRONG WAY! Turn around!');
    }
    if (!this.wrongWay && this._wrongWayShown) this._wrongWayShown = false;
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
          const relV = (myVx - theirVx) * pushX + (myVz - theirVz) * pushZ;
          if (relV > 0 && this._carImpactCooldown <= 0) {
            this._carImpactCooldown = 0.3;
            const hit = Math.min(relV * 0.35, 8);
            this.carSpeed -= hit;
            if (other.isBot) other.ref.speed += hit * 0.3;
            this.carYaw += (Math.random() - 0.5) * 0.02;
            if (other.isBot) other.ref.yaw += (Math.random() - 0.5) * 0.02;
            this.screenShake = Math.max(0.02, Math.min(0.08, relV * 0.01));
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
      const lookDist = bot.dist + AI_LOOKAHEAD * 5;
      const target = this.renderer.getTrackPointAlong(lookDist);
      const baseSpeed = bot.config.speedBase * bot.pace * (1 + this.getSpeedBonus() / 200);
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
      bot.yaw += yawDiff * bot.config.cornerSkill * 0.1;
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
      const yawRate = Math.abs(bot.yaw - prevYaw) / Math.max(0.0001, dt);
      const speedFactor = Math.min(1, Math.abs(bot.speed) / 8);
      bot.slide = Math.min(1, (yawRate / 3.5) * speedFactor);
      const curTP = this.renderer.getTrackPointAlong(bot.dist);
      const ppx = -curTP.dirZ;
      const ppz = curTP.dirX;
      const laneX = curTP.x + ppx * effLane;
      const laneZ = curTP.z + ppz * effLane;
      const snap = 0.05 + bot.config.cornerSkill * 0.08;
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
      }
      let delta = bot.dist - prevBotDist;
      if (delta < -this.renderer.totalTrackDist * 0.5) delta += this.renderer.totalTrackDist;
      else if (delta > this.renderer.totalTrackDist * 0.5) delta -= this.renderer.totalTrackDist;
      bot.raceDist += delta;
      bot.lap = Math.max(0, Math.floor(bot.raceDist / this.renderer.totalTrackDist));
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
            a.speed *= 0.98;
            b.speed *= 0.98;
            a.yaw += (Math.random() - 0.5) * 0.08;
            b.yaw += (Math.random() - 0.5) * 0.08;
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
    if (prevDist > trackLen * 0.8 && this.carDist < trackLen * 0.2) {
      this.currentLap++;
      if (this.currentLap >= this.totalLaps) {
        // The winner's line-crossing roar is played by playWinnerCheer in
        // finishRace (synced with the cannonade), so skip the generic big
        // cheer here for P1 to avoid two overlapping roars; everyone else
        // still gets the full lap-end cheer.
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
    const playerDist = this.currentLap * this.renderer.totalTrackDist + this.carDist;
    const allRacers: { dist: number; isPlayer: boolean }[] = this.bots.map(b => ({
      dist: b.raceDist,
      isPlayer: false
    }));
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
  private async finishRace() {
    if (this._raceFinished) return;
    this._raceFinished = true;
    const totalTime = performance.now() - this.raceStartTime;
    if (this._mpLobbyTrackId && !this._mpFinished) {
      this._mpFinished = true;
      this.racingHub.finishRace(this._mpLobbyTrackId, this.racePosition, totalTime, this.currentLap);
    }
    this.buildFinalStandings();
    this.gameState = 'finished';
    const basePrize = this.selectedTrack?.prizePool || 300;
    const positionMultiplier = Math.max(0.1, 1 - (this.racePosition - 1) * 0.15);
    const moneyEarned = Math.round(basePrize * positionMultiplier);
    this.playerCar.totalRaces++;
    this.playerCar.totalEarnings += moneyEarned;
    if (this.racePosition === 1) {
      this.playerCar.wins++;
      this.addMessage(`🏆 YOU WIN! +$${moneyEarned}`);
      // Winner's moment — confetti cannonade, a crowd roar + applause + whistle
      // mix, and a visual cheering spike in the animated stands, all fired
      // together so the celebration lands exactly on the line crossing.
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
        // Flash the record-improvement toast: old → new (or a first-record
        // celebration when there was no previous time on this track).
        this.showRecordToast(prevTrackBest, this.bestLapTime, trackIdForLap);
        this.playerCar.bestLapsByTrack[trackIdForLap] = this.bestLapTime;
        // If this lap also crossed ahead of the player's fastest friend on the
        // track, fire the beat-your-friend milestone (fetches friends on demand).
        await this.maybeCelebrateFriendBeat(trackIdForLap, prevTrackBest);
      }
      // Keep the overall best in sync (smallest per-track lap).
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
    this.racingService.submitRaceResult(this.parentRef?.user?.id ?? 0, result);
    await this.loadLeaderboard();
    this.recordRankMovement();
  }

  /** Snapshot every racer's progress at the moment the player crosses the line
   *  and sort into the final classification shown on the results screen. */
  private buildFinalStandings() {
    const trackLen = this.renderer.totalTrackDist;
    const palette = ['#e53935', '#4a9eff', '#4caf50', '#ffd600', '#9c27b0', '#ff9800', '#00bcd4', '#e91e63'];
    const racers: { name: string; playerId: number; isBot: boolean; isPlayer: boolean; color: string; dist: number; laps: number }[] = [];
    for (const b of this.bots) {
      if (!b.alive) continue;
      racers.push({
        name: b.name, playerId: 0, isBot: true, isPlayer: false,
        color: palette[b.color % palette.length],
        dist: b.raceDist,
        laps: b.lap,
      });
    }
    this.remoteCars.forEach(rc => {
      racers.push({
        name: rc.playerName, playerId: rc.playerId || 0, isBot: false, isPlayer: false,
        color: `rgb(${Math.round(rc.colorR * 255)}, ${Math.round(rc.colorG * 255)}, ${Math.round(rc.colorB * 255)})`,
        dist: rc.lap * trackLen + rc.distance,
        laps: rc.lap,
      });
    });
    racers.push({
      name: this.playerCar.playerName?.trim() || this.parentRef?.user?.username || 'Player',
      playerId: this.parentRef?.user?.id || 0,
      isBot: false, isPlayer: true, color: '#ffffff',
      dist: this.currentLap * trackLen + this.carDist,
      laps: this.currentLap,
    });
    racers.sort((a, b) => b.dist - a.dist);
    // Remote players who dropped mid-race are DNF: keep them on the board but
    // retired, after every finisher regardless of how far they'd driven.
    const dnfRows = this.dnfRacers.map(d => ({
      position: -1, name: d.name, playerId: d.playerId,
      isBot: false, isPlayer: false, isDnf: true,
      color: d.color || '#9e9e9e', laps: 0,
    }));
    this.finalStandings = [
      ...racers.map((r, i) => ({
        position: i + 1, name: r.name, playerId: r.playerId,
        isBot: r.isBot, isPlayer: r.isPlayer, isDnf: false,
        color: r.color,
        // Bots keep lapping past the checkered flag — cap the column at the race length.
        laps: Math.min(r.laps, this.totalLaps),
      })),
      ...dnfRows,
    ];
  }

  // Opens the same racer profile popup the leaderboard uses, from a final
  // standings row. Bots and racers without a known userId are not clickable.
  openStandingsProfile(s: { playerId: number; name: string; isBot: boolean }): void {
    if (!s || s.isBot || s.playerId <= 0) return;
    this.openRacerProfile({
      position: 0, playerId: s.playerId, playerName: s.name,
      lapTime: 0, totalTime: 0, moneyEarned: 0, isBot: false,
    });
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
    // Same subtle tick/chime as the lobby countdown once the window drops to
    // 3s, so a player in the garage isn't caught off guard by the rematch race
    // auto-starting. One tick per whole second — always the urgent high blip
    // (playCountdownTick uses 880Hz for secondsLeft <= 3, which is all we call).
    // Each tick also flashes the panel border, syncing the visual to the audio.
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
    // The server orders rows finishers-then-DNF; DNF racers never claim a slot —
    // they're appended after every finisher and bot.
    const finishers = rows.filter(r => !r.isDnf).sort((a, b) => a.position - b.position);
    const dnfs = rows.filter(r => r.isDnf);
    const claimed = new Set(finishers.map(p => p.position));
    // Bots are client-simulated and deterministic, so their relative order is
    // identical on every client at the broadcast moment. Only merge them when a
    // race is actually in progress or finished — a player who joins a lobby
    // mid-standings is in the menu state, where their local bot list is stale
    // and would leak wrong rows into the previous-race panel.
    const inRace = this.gameState === 'racing' || this.gameState === 'finished';
    const bots = inRace ? this.bots.filter(b => b.alive).slice().sort((a, b) => b.raceDist - a.raceDist) : [];
    const total = bots.length + finishers.length;
    let botIdx = 0;
    const result: { position: number; name: string; playerId: number; isBot: boolean; isPlayer: boolean; isDnf: boolean; color: string; laps: number }[] = [];
    for (let pos = 1; pos <= total; pos++) {
      const p = claimed.has(pos) ? finishers.find(x => x.position === pos) : undefined;
      if (p) {
        const rc = this.remoteCars.get(p.connectionId);
        const color = rc
          ? `rgb(${Math.round(rc.colorR * 255)}, ${Math.round(rc.colorG * 255)}, ${Math.round(rc.colorB * 255)})`
          : this.getPlayerColor(p.connectionId);
        result.push({
          position: pos, name: p.playerName, playerId: p.playerId,
          isBot: false, isPlayer: p.playerId > 0 && p.playerId === myId, isDnf: false,
          color, laps: Math.min(p.laps || 0, this.totalLaps),
        });
      } else if (botIdx < bots.length) {
        const b = bots[botIdx++];
        result.push({
          position: pos, name: b.name, playerId: 0, isBot: true, isPlayer: false, isDnf: false,
          color: palette[b.color % palette.length],
          laps: Math.min(b.lap, this.totalLaps),
        });
      }
    }
    // Safety net: a player whose reported position fell outside 1..total still
    // belongs on the board — append any unplaced finishers in position order.
    for (const p of finishers) {
      if (!result.some(r => !r.isBot && r.playerId === p.playerId && r.name === p.playerName)) {
        const rc = this.remoteCars.get(p.connectionId);
        result.push({
          position: result.length + 1, name: p.playerName, playerId: p.playerId,
          isBot: false, isPlayer: p.playerId > 0 && p.playerId === myId, isDnf: false,
          color: rc
            ? `rgb(${Math.round(rc.colorR * 255)}, ${Math.round(rc.colorG * 255)}, ${Math.round(rc.colorB * 255)})`
            : this.getPlayerColor(p.connectionId),
          laps: Math.min(p.laps || 0, this.totalLaps),
        });
      }
    }
    // Retired racers go last, in the order the server reported them.
    for (const p of dnfs) {
      const rc = this.remoteCars.get(p.connectionId);
      result.push({
        position: -1, name: p.playerName, playerId: p.playerId,
        isBot: false, isPlayer: p.playerId > 0 && p.playerId === myId, isDnf: true,
        color: rc
          ? `rgb(${Math.round(rc.colorR * 255)}, ${Math.round(rc.colorG * 255)}, ${Math.round(rc.colorB * 255)})`
          : '#9e9e9e',
        laps: 0,
      });
    }
    this.finalStandings = result;
  }

  // Compares the user's current leaderboard rank against the rank stored from
  // their last race on this track (localStorage), then persists the current
  // rank so the next race can show the delta. Skipped when there's no rank yet.
  private recordRankMovement() {
    const trackId = this.selectedTrack?.id ?? 1;
    const uid = this.parentRef?.user?.id ?? 0;
    if (!uid || this.leaderboardUserRank <= 0) return;
    const key = `gp_rank_${trackId}_${uid}`;
    let prev = 0;
    try {
      const raw = localStorage.getItem(key);
      prev = raw ? parseInt(raw, 10) || 0 : 0;
    } catch { /* localStorage unavailable */ }
    this.rankMovement = prev > 0 ? this.leaderboardUserRank - prev : 0;
    try {
      localStorage.setItem(key, String(this.leaderboardUserRank));
    } catch { /* localStorage unavailable */ }
  }

  // '▲ up 3 since last race' / '▼ down 2 since last race' / '' when no delta.
  getLeaderboardRankMovement(): string {
    const d = this.rankMovement;
    if (d === 0) return '';
    const dir = d < 0 ? '▲ up' : '▼ down';
    return `${dir} ${Math.abs(d)} since last race`;
  }

  // ─── Racer profile popup ───
  // Clicking a name on the leaderboard fetches that racer's car state (which
  // carries the per-track best-lap breakdown) and shows it in a popup instead
  // of only the single best lap the board row displays.
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
  // Opens the racer profile popup from a vs-friends row (the rows carry the
  // friend's userId + playerName, reusing the exact leaderboard popup flow).
  openFriendProfile(fr: { userId: number; playerName: string }): void {
    if (!fr || fr.userId <= 0) return;
    this.openRacerProfile({
      position: 0, playerId: fr.userId, playerName: fr.playerName,
      lapTime: 0, totalTime: 0, moneyEarned: 0, isBot: false,
    });
  }
  // Open the racer's full site profile in-app.
  openFullRacerProfile() {
    const p = this.racerProfile;
    if (!p) return;
    this.parentRef?.createComponent('User', { userId: p.playerId });
    this.closeRacerProfile();
  }
  // Per-track best-lap breakdown for the popup racer, in track order, only
  // including tracks with a recorded lap.
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
    // The server already ranks the current user if their lap cracks the top 50
    // — leave it in its ranked position and just let the row highlight. Only pin
    // the user's lap at the end when it did NOT make the list, so they can still
    // see where they stand (or that they haven't set a lap yet) on the track.
    if (uid && !this.leaderboard.some(r => r.playerId === uid)) {
      // Per-track record: only the lap actually set on this circuit counts here.
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
      // If the user has a lap but sits outside the fetched top-50, use the
      // server-computed rank so the summary row is still accurate.
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
      // Show how far off the pace when the user isn't the leader and both the
      // pace-setter lap and the user's own track best are known.
      const leader = this.leaderboardBestLap;
      const myBest = this.getTrackBestLap(this.selectedTrack?.id ?? 1);
      if (rank > 1 && leader > 0 && myBest > 0 && myBest > leader) {
        text += ` · ${this.formatLapGap(myBest - leader)} behind 1st`;
      }
      return text;
    }
    return total > 0 ? `No lap yet — ${total} racers on this level` : 'No laps recorded yet';
  }

  // ─── Live in-race pace readout ───
  // 'P+0.4s' vs the track's pace-setter lap + '+1.2s vs best' against the
  // player's own per-track record, computed from the live current-lap clock.
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
  // True when the live lap is at or ahead of the track's pace-setter.
  getLivePaceAhead(): boolean {
    const live = this.liveLapTime;
    return live > 0 && this.leaderboardBestLap > 0 && live <= this.leaderboardBestLap;
  }
  async toggleLeaderboard() {
    this.showLeaderboard = !this.showLeaderboard;
    if (this.showLeaderboard) await this.loadLeaderboard();
  }
  // Name of the circuit a leaderboard row belongs to. Rows are filtered to the
  // selected track server-side, but we resolve per-row (via r.trackId when the
  // row carries one) so the label stays correct for every entry.
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
      301: 'prev-exhaust-sport', 302: 'prev-exhaust-titanium', 303: 'prev-exhaust-twin', 304: 'prev-exhaust-quad', 305: 'prev-exhaust-carbon',
      401: 'prev-decal-stripes', 402: 'prev-decal-flame', 403: 'prev-decal-carbon', 404: 'prev-decal-number',
      405: 'prev-decal-checkered', 406: 'prev-decal-lightning', 407: 'prev-decal-skull', 408: 'prev-decal-lion',
      409: 'prev-decal-number7', 410: 'prev-decal-number27', 411: 'prev-decal-number99', 412: 'prev-decal-sponsor',
      501: 'prev-glow-blue', 502: 'prev-glow-green', 503: 'prev-glow-purple', 504: 'prev-glow-pink',
      505: 'prev-glow-cyan', 506: 'prev-glow-red', 507: 'prev-glow-gold',
      601: 'prev-accent-white', 602: 'prev-accent-gold', 603: 'prev-accent-silver', 604: 'prev-accent-red',
      605: 'prev-accent-blue', 606: 'prev-accent-black',
    };
    return previews[p.id] ?? '';
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
  async buyAppearancePart(part: RacingAppearancePart) {
    if (this.isBuying || this.playerCar.money < part.cost) return;
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
    // No save here — callers (buyAppearancePart) persist once with await so the
    // in-flight guard stays true until the write completes (prevents double buys
    // racing two saveCar calls).
  }
  getSpoilerStyle(): string {
    const id = this.playerCar.spoilerId;
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
    const id = this.playerCar.rimId;
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
    const id = this.playerCar.exhaustId;
    if (id === 301) return 'exhaust-sport';
    if (id === 302) return 'exhaust-titanium';
    if (id === 303) return 'exhaust-twin';
    if (id === 304) return 'exhaust-quad';
    if (id === 305) return 'exhaust-carbon';
    return '';
  }
  getDecalStyle(): string {
    const id = this.playerCar.decalId;
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
    return '';
  }
  getGlowStyle(): string {
    const id = this.playerCar.glowId;
    if (id === 501) return 'glow-blue';
    if (id === 502) return 'glow-green';
    if (id === 503) return 'glow-purple';
    if (id === 504) return 'glow-pink';
    if (id === 505) return 'glow-cyan';
    if (id === 506) return 'glow-red';
    if (id === 507) return 'glow-gold';
    return '';
  }
  getAccentStyle(): string {
    const id = this.playerCar.accentId;
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
  // The equipped appearance packed for the 3D renderer — used for the player's
  // own car (rear-view mirror) and as the base for remote cars.
  getPlayerAppearance(): RacingCarAppearance {
    const skin = CAR_SKINS.find(s => s.id === this.playerCar.skinId) || CAR_SKINS[0];
    return {
      rimStyle: this.playerCar.rimId,
      accent: ACCENT_COLORS[this.playerCar.accentId] ?? undefined,
      decalStyle: this.playerCar.decalId,
      glow: GLOW_COLORS[this.playerCar.glowId] ?? undefined,
      metallic: SKIN_FINISH_FACTOR[skin.finish] ?? 0.45,
      skin: this.hexToRgb(skin.color),
    };
  }
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
  gasDown() { this.gasHeld = true; }
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

  // Shows (or refreshes) the new-track-record toast for ~4.5s, with the old vs
  // new time so players see exactly how much they beat themselves by.
  private showRecordToast(prev: number, curr: number, trackId: number) {
    if (curr <= 0) return;
    this.recordToast = { old: prev, new: curr, trackId };
    if (this._recordToastTimer) clearTimeout(this._recordToastTimer);
    this._recordToastTimer = setTimeout(() => this.recordToast = null, 4500);
  }

  // After a per-track record improves, checks whether the new time crossed ahead
  // of the player's fastest friend on that track. Fetches the vs-friends data on
  // demand (only when a record was actually beaten, so it's a rare call).
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
    // Only celebrate the crossing: not already ahead before this lap, and now
    // strictly faster than the friend's best on the track.
    const wasAlreadyAhead = prevBest > 0 && prevBest < fastestLap;
    if (wasAlreadyAhead || this.bestLapTime >= fastestLap) return;
    this.showBeatFriendToast(fastestName, fastestLap - this.bestLapTime, trackId);
  }

  private showBeatFriendToast(friendName: string, margin: number, trackId: number) {
    this.beatFriendToast = { friendName, margin, trackId };
    if (this._beatFriendToastTimer) clearTimeout(this._beatFriendToastTimer);
    this._beatFriendToastTimer = setTimeout(() => this.beatFriendToast = null, 4500);
  }
  // Track name for the beat-your-friend toast.
  getBeatFriendToastTrack(): string {
    const t = this.beatFriendToast;
    if (!t) return '';
    const track = this.trackDefs.find(x => x.id === t.trackId);
    return track ? track.name : 'this track';
  }
  // The margin by which you beat your friend, e.g. '0.4s'.
  getBeatFriendMarginText(): string {
    const t = this.beatFriendToast;
    if (!t) return '';
    return `${(t.margin / 1000).toFixed(1)}s`;
  }
  // '1:02.4 → 1:00.1' (or '— → 1:00.1' when there was no previous record).
  getRecordToastTimes(): string {
    const t = this.recordToast;
    if (!t) return '';
    const oldStr = t.old > 0 ? this.formatTime(t.old) : '—';
    return `${oldStr} → ${this.formatTime(t.new)}`;
  }
  // Track name for the toast (fallback 'this track').
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
  getAnalogNeedleDeg(): number {
    return -120 + Math.min(1, this.hudRPM) * 240;
  }
  closeLoginPanel() {
    this.gameState = 'menu';
  }
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
      if (this._crowdFilter2) this._crowdFilter2.disconnect();
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
    this._crowdFilter2 = null;
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
      // Ensure the context is actually running — browsers suspend it until a
      // user gesture, and without resume() the title music stays silent.
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
      // Ambient crowd murmur: amplitude-modulated noise (slow random swells so
      // it reads as many distant voices, not steady hiss) through TWO parallel
      // bandpass bands — a low murmur body + a higher chatter shimmer.
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
    const rpm = Math.max(0.3, Math.min(1.25, speed / maxSpd * 1.35 + 0.3));
    const baseFreq = 52 + rpm * 140;
    if (this._subOsc) this._subOsc.frequency.setTargetAtTime(baseFreq * 0.5, t, 0.05);
    if (this._engineOsc) this._engineOsc.frequency.setTargetAtTime(baseFreq, t, 0.05);
    if (this._engineOsc2) this._engineOsc2.frequency.setTargetAtTime(baseFreq, t, 0.05);
    if (this._harmOsc) this._harmOsc.frequency.setTargetAtTime(baseFreq * 2, t, 0.05);
    this._engineFilter.frequency.setTargetAtTime(350 + rpm * 900, t, 0.08);
    this._engineGain.gain.setTargetAtTime(0.04 + rpm * 0.05, t, 0.08);
    const speedRatio = Math.min(1, speed / maxSpd);
    if (this._windFilter) this._windFilter.frequency.setTargetAtTime(400 + speedRatio * 2200, t, 0.15);
    if (this._windGain) this._windGain.gain.setTargetAtTime(speedRatio * speedRatio * 0.05, t, 0.15);
    const slide = Math.min(1, this._playerSlide);
    if (this._screechGain) {
      this._screechGain.gain.setTargetAtTime(slide * 0.055, t, 0.05);
      if (this._screechFilter) this._screechFilter.frequency.setTargetAtTime(1800 + slide * 1800, t, 0.07);
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

        // Reaction moment: when the car crosses a grandstand position at speed,
        // fire a short sharp crowd roar swell with a Doppler pitch sweep and
        // spike the animated crowd to cheer harder for a few seconds.
        if (this._prevLapFrac >= 0) {
          const lapFrac = lapPos / td;
          let crossed = -1;
          for (let i = 0; i < RacingComponent.GRANDSTAND_FRACS.length; i++) {
            const f = RacingComponent.GRANDSTAND_FRACS[i];
            // Wrap-aware crossing: did we pass frac f since the last frame?
            const crossedIt = this._prevLapFrac <= lapFrac
              ? (this._prevLapFrac <= f && f <= lapFrac)
              : (f >= this._prevLapFrac || f <= lapFrac); // lap wrap (0 boundary)
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
  // A "reaction moment" roar — short, sharp swell that rises as the car
  // approaches the stand then drops as it passes (subtle Doppler), built from
  // layered noise bands with an attack/release envelope. Synced with the
  // animated crowd spiking via renderer.exciteCrowd().
  private playStandRoar(speed: number) {
    if (!this.soundOn || !this._audioCtx || this.gameState !== 'racing') return;
    try {
      const ctx = this._audioCtx;
      const t = ctx.currentTime;
      const dur = 2.2;
      // Doppler: pitch rises ~15% as the car approaches, falls back past base
      // as it passes — subtle, not a siren.
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
          // Fast swell-in, then a natural crowd roar decay — short and sharp.
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

  // A crowd cheer is a MIX of many voices — low roar body, mid chatter and a
  // high shimmer — each band amplitude-modulated so it ripples like a real
  // crowd instead of steady hiss. The old "whistle" was one long piercing
  // 2.3kHz tone with a resonant bandpass; now whistles are just a few short,
  // quiet blips buried inside the cheer, and everything sits at modest gain so
  // it reads as a distant grandstand, not a close-up referee.
  private playCrowdCheer(type: 'roar' | 'whistle' | 'applause' | 'wave' | 'big' = 'roar', intensity = 1) {
    if (!this.soundOn || !this._audioCtx || this.gameState !== 'racing') return;
    try {
      const ctx = this._audioCtx;
      const t = ctx.currentTime;
      const dur = type === 'big' ? 3.4 : type === 'applause' ? 2.2 : 2.6;
      const peak = (type === 'big' ? 0.13 : 0.085) * intensity;

      // 'wave' — a slow swell passing along the stands, its own buffer + swell
      // envelope (quieter and wider-band than the old version). It plays on
      // its own, not on top of the layered mix below.
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

      // Layered voice mix. `vol` relative to peak; bands are slightly muffled
      // (modest Q) so the result stays soft and distant.
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
          // "many voices" flutter + per-sample variation
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

      // Scattered distant whistle blips — short, quiet chirps "from someone in
      // the stands", never a long piercing tone, and always small vs the mix.
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
  // Victory roar — the crowd's reaction to the winner crossing the line,
  // layered louder and fuller than the per-lap cheers: a big roaring swell
  // with applause underneath and scattered whistles on top, all starting at
  // the same instant as the confetti cannonade (allowFinished lets it play in
  // the 'finished' state the race just entered).
  private playWinnerCheer() {
    if (!this.soundOn || !this._audioCtx) return;
    try {
      const ctx = this._audioCtx;
      const t = ctx.currentTime;
      const dur = 4.2;
      const peak = 0.16;
      // Two overlapping voice layers — a deep roar and a brighter cheer — plus
      // a mid-density applause band underneath.
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
      // Scattered victory whistles + one sharp leading whistle right at the
      // line crossing, so the spike is instantly audible.
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
    if (!this.soundOn || !this._audioCtx || this.gameState !== 'racing') return;
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
  getTrackBestLap(trackId: number): number {
    const bests = this.playerCar?.bestLapsByTrack;
    return (bests && bests[trackId] > 0) ? bests[trackId] : 0;
  }
  getOverallBestLap(): number {
    return this.playerCar?.bestLap ?? 0;
  }
  /** Per-track top-5 paces for the garage RECORDS mini-tables (trackId → rows). */
  trackTopLaps: { [trackId: number]: RaceResult[] } = {};
  // Friends' per-track bests (userId → bestLapsByTrack) for the 'vs friends' toggle.
  friendRecords: { userId: number; playerName: string; bestLapsByTrack: Record<number, number> }[] = [];
  // Whether the RECORDS tab shows the per-track friend comparison.
  friendsMode = false;
  friendsLoading = false;

  // RECORDS tab opens the per-track records — also warm the top-5 pace tables
  // so players see the time to beat on every circuit without extra clicks.
  async openRecordsTab() {
    this.selectedTab = 'records';
    await this.loadAllTrackTopLaps();
  }

  // Toggles the per-track 'vs friends' comparison and lazily loads the friends'
  // record data the first time it's needed.
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

  // Friends who have a lap on this track, sorted fastest-first, each carrying
  // the lap time and a 'vs your best' gap label for the RECORDS comparison.
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

  // How many friends the player is strictly ahead of on this track (0 when the
  // player has no record yet, or no friend has a lap on this circuit). Drives
  // the per-card 'ahead of N friends' summary badge.
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

  // Gap of a row vs the pace-setter on THIS track's mini-table (independent of
  // the main leaderboard's selected-track state).
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
