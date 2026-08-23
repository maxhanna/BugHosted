import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppModule } from '../app.module';
import { ChildComponent } from '../child.component';
import { MarblesHubService, MarblesLobbyState, MarblesPlayer, MarblesBoardUpdate, MarblesOpponentView, MarblesPublicRoom } from '../../services/marbles-hub.service';
import { MarblesService, MarblesScore } from '../../services/marbles.service';

const COLS = 5;
const ROWS = 12;
const PITCH_ROW = 5;
/** Delay (ms) before a received opponent snapshot is played back, so uneven
 *  network delivery is absorbed before it reaches the opponent's board. */
const OPP_BUFFER_MS = 150;
/** Duration (s) of the blocked-column-shift nudge wiggle. */
const NUDGE_DUR = 0.35;
/** Duration (s) of the full-5-row "reserve dump" celebration burst. */
const DUMP_BURST_DUR = 1.1;
/** Radius (px) marble-face sprites are baked at before being blitted each
 *  frame — the moving marbles blit a cached canvas instead of re-running the
 *  expensive gradient/pattern/grain pipeline, which was the mobile lag. */
const MARBLE_SPRITE_R = 64;

// ── Background music ───────────────────────────────────────────────────
// A cheerful Win98-style chiptune loop, synthesized live with Web Audio (no
// audio assets). Bouncy square-wave lead over a walking triangle bass with a
// soft kick/hat, in a bright major key — the kind of tune the original 1997
// game's soundtrack had. The loop is 32 eighth-notes long at ~132bpm.
const MUSIC_BPM = 132;
/** One eighth-note (s) at the music tempo. */
const MUSIC_EIGHTH = 60 / MUSIC_BPM / 2;
/** How far ahead (s) the scheduler keeps notes queued — smooths jank. */
const MUSIC_AHEAD = 0.28;
/** The master music volume (kept low so it sits under the SFX). */
const MUSIC_VOLUME = 0.10;
/** Note names → frequency, so the tune is readable as sheet music. */
const NOTE: Record<string, number> = {
  'C3': 130.81, 'D3': 146.83, 'E3': 164.81, 'F3': 174.61, 'G3': 196.00, 'A3': 220.00, 'B3': 246.94,
  'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23, 'G4': 392.00, 'A4': 440.00, 'B4': 493.88,
  'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'F5': 698.46, 'G5': 783.99, 'A5': 880.00, 'B5': 987.77,
  'C6': 1046.5, 'D6': 1174.7, 'E6': 1318.5, 'F6': 1396.9, 'G6': 1568.0, 'A6': 1760.0,
  'R': 0, // rest
};
/** Lead melody — 32 eighth-note steps (4 bars of 8), bouncy and upbeat. */
const MUSIC_MELODY: string[] = [
  'E5', 'G5', 'A5', 'G5', 'E5', 'D5', 'C5', 'D5',
  'E5', 'G5', 'A5', 'C6', 'B5', 'A5', 'G5', 'E5',
  'F5', 'A5', 'C6', 'A5', 'F5', 'E5', 'D5', 'C5',
  'D5', 'E5', 'G5', 'E5', 'D5', 'C5', 'D5', 'R',
];
/** Bass line — roots on the beat, octave hops for bounce. */
const MUSIC_BASS: string[] = [
  'C3', 'R', 'G3', 'R', 'C3', 'R', 'G3', 'R',
  'C3', 'R', 'G3', 'R', 'A3', 'R', 'E3', 'R',
  'F3', 'R', 'C4', 'R', 'F3', 'R', 'C4', 'R',
  'G3', 'R', 'D4', 'R', 'G3', 'R', 'D4', 'R',
];
/** Which steps get a kick (each bar's downbeat) and a hat (off-beats). */
const MUSIC_KICK = [0, 8, 16, 24];
const MUSIC_HAT = [2, 4, 6, 10, 12, 14, 18, 20, 22, 26, 28, 30];

/** Palette indexed by color id (1..6); 0 is empty. */
const COLORS: [number, number, number][] = [
  [0, 0, 0],
  [178, 22, 38],   // red — deep crimson (dark, unmistakable vs orange)
  [255, 130, 14],  // orange — bright vivid pumpkin (clearly not yellow/red)
  [252, 208, 25],  // yellow — bright lemon
  [20, 165, 85],   // green — emerald (clearly not yellow)
  [44, 100, 224],  // blue — royal
  [20, 20, 26],    // black — obsidian (near-black, reads as a black marble)
];

/** Marble skins per color id (1..6). Every color family now has a small set
 *  of skins (pattern types), and each marble picks one deterministically from
 *  its seed — so same-colour marbles still vary and the splash screen can
 *  show a random marble. The first entry is the classic signature look for
 *  that colour.
 *  0 = swirl · 1 = flecked · 2 = cat's-eye · 3 = rings · 4 = spiral ·
 *  5 = stripes · 6 = starburst · 7 = dice dots. */
const SKINS: number[][] = [
  [],
  [0, 6, 1],    // red: swirl, starburst, flecked
  [1, 7, 2],    // orange: flecked, dice, cat's-eye
  [2, 0, 5],    // yellow: cat's-eye, swirl, stripes
  [3, 6, 7],    // green: rings, starburst, dice
  [4, 3, 2],    // blue: spiral, rings, cat's-eye
  [1, 7, 3],    // black: flecked, dice dots, rings — pale marks on obsidian
];

/** A playable arena — changes the board's background, recessed pit, and
 *  ambient decor. Purely cosmetic and client-side: pick your vibe in the
 *  menu and both boards (yours + the opponent's) render on it. */
interface BoardMapTheme {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  /** Backdrop gradient (top → bottom). */
  bg: [string, string, string];
  darkSpeckle: string;
  lightSpeckle: string;
  /** Recessed pit gradient (top → bottom). */
  pit: [string, string, string];
  bevelLight: string;
  lip: string;
  decor: 'playground' | 'stars' | 'waves' | 'clouds' | 'neon' | 'lava' | 'snow' | 'cactus';
}

const BOARD_MAPS: BoardMapTheme[] = [
  { id: 'classic', name: 'Sunny Playground', emoji: '☀️', desc: 'A lifelike recessed sandbox — warm honey sand under a soft blue sky, wooden-beamed pit and real playground equipment beyond.',
    bg: ['#87c4eb', '#d8c39a', '#c2a46a'], darkSpeckle: 'rgba(110,78,30,0.14)', lightSpeckle: 'rgba(255,250,230,0.42)',
    pit: ['#a27a3f', '#8a662f', '#6b4f26'], bevelLight: 'rgba(255,245,210,0.55)', lip: 'rgba(255,240,200,0.42)', decor: 'playground' },
  { id: 'beach', name: 'Boardwalk Beach', emoji: '🏖️', desc: 'Sun-bleached boardwalk planks beside rolling surf — foam-capped waves, wet sand sheen and distant gulls over the bay.',
    bg: ['#7ec8e3', '#e6d0a8', '#d0b68a'], darkSpeckle: 'rgba(110,80,30,0.12)', lightSpeckle: 'rgba(255,250,220,0.42)',
    pit: ['#c9a96b', '#a9894f', '#7d6537'], bevelLight: 'rgba(255,250,225,0.45)', lip: 'rgba(255,244,214,0.34)', decor: 'waves' },
  { id: 'ice', name: 'Snow Day Playground', emoji: '⛄', desc: 'A snowy schoolyard at recess — powder-soft drifts, pine trees heavy with snow and a friendly snowman watching the game.',
    bg: ['#d6eef8', '#eaf6fb', '#d0e4f0'], darkSpeckle: 'rgba(30,70,110,0.10)', lightSpeckle: 'rgba(255,255,255,0.62)',
    pit: ['#a8cde0', '#85b0c8', '#6b94b0'], bevelLight: 'rgba(255,255,255,0.62)', lip: 'rgba(245,252,255,0.45)', decor: 'snow' },
  { id: 'space', name: 'Rocket Park', emoji: '🚀', desc: 'A space-themed playground at golden hour — rocket jungle-gym, crater mounds and a galaxy mural fading into a warm sunset sky.',
    bg: ['#4a6fa5', '#c9b8e8', '#e8d5b8'], darkSpeckle: 'rgba(40,30,60,0.14)', lightSpeckle: 'rgba(255,240,255,0.32)',
    pit: ['#6b5a8a', '#4f3f6e', '#3b2e56'], bevelLight: 'rgba(230,210,255,0.38)', lip: 'rgba(255,230,245,0.28)', decor: 'stars' },
  { id: 'neon', name: 'Glow Play Center', emoji: '✨', desc: 'An indoor soft-play jungle — pastel rubber mats, neon rope lights and glow-in-the-dark slides under blacklight haze.',
    bg: ['#fff3e0', '#e8e0f8', '#f5d6e8'], darkSpeckle: 'rgba(80,40,90,0.06)', lightSpeckle: 'rgba(255,120,200,0.14)',
    pit: ['#e9d5ff', '#c8b0e8', '#a88ec8'], bevelLight: 'rgba(255,240,255,0.55)', lip: 'rgba(180,255,255,0.22)', decor: 'neon' },
  { id: 'meadow', name: 'Country Meadow', emoji: '🌿', desc: 'A lush county-fair playground in late summer — velvety green lawn, picket fence, buttercups and cotton-cloud sky.',
    bg: ['#87c76a', '#a8d98e', '#d6efb8'], darkSpeckle: 'rgba(30,70,20,0.12)', lightSpeckle: 'rgba(250,255,235,0.42)',
    pit: ['#6aa84a', '#4e8a32', '#3a6826'], bevelLight: 'rgba(245,255,225,0.42)', lip: 'rgba(235,250,210,0.32)', decor: 'clouds' },
  { id: 'desert', name: 'Desert Oasis', emoji: '🌵', desc: 'A lifelike adobe desert playground — sun-baked mesas, tumbleweeds, a shaded ramada and cool turquoise shade cloth.',
    bg: ['#e2b88a', '#d9a86a', '#c28a42'], darkSpeckle: 'rgba(110,70,20,0.14)', lightSpeckle: 'rgba(255,240,200,0.38)',
    pit: ['#b68a3e', '#9c7532', '#7d5b26'], bevelLight: 'rgba(255,240,200,0.42)', lip: 'rgba(255,236,190,0.34)', decor: 'cactus' },
  { id: 'lava', name: 'Volcano Splash Pad', emoji: '🌋', desc: 'A volcanic splash-park — warm terra-cotta rock, misty geysers, cool turquoise water jets and palm-shaded spray zones.',
    bg: ['#8ecae6', '#e8b88a', '#d48a5a'], darkSpeckle: 'rgba(90,40,20,0.12)', lightSpeckle: 'rgba(255,220,180,0.28)',
    pit: ['#c97a48', '#a85e32', '#7d3f22'], bevelLight: 'rgba(255,220,180,0.42)', lip: 'rgba(255,200,150,0.32)', decor: 'lava' },
];

type SpritePhase = 'move' | 'pop';

interface Sprite {
  color: number;
  col: number; row: number;      // current visual position (grid units)
  tCol: number; tRow: number;    // target position
  fromCol: number; fromRow: number; // start of the current move (for time-based interpolation)
  moveT: number;                 // 0..1 progress through the current move
  moveDur: number;               // ms for the move; 0 = legacy fixed-speed animation
  scale: number;
  roll: number;
  stretch: number;               // horizontal squash-stretch while sliding (1 = rest)
  phase: SpritePhase;
  id: number;
  popDelay: number;              // seconds of tremble before the shatter starts
  popT: number;                  // seconds since the pop began
  broken: boolean;               // true once the shatter burst has fired
  _popHold?: number;              // seconds since shatter burst fired (brief hold before shrink)
}

/** A fragment or flash ring from a marble's shatter burst (grid-space). */
interface PopShard {
  col: number; row: number;      // grid position (fractional)
  vCol: number; vRow: number;    // velocity in cells/sec
  life: number; maxLife: number; // remaining / total lifetime (seconds)
  size: number;                  // radius in cell units
  color: [number, number, number];
  spin: number; spinSpeed: number;
  ring: boolean;                 // true = expanding flash ring, else a fragment
}

@Component({
  selector: 'app-marbles',
  templateUrl: './marbles.component.html',
  styleUrl: './marbles.component.css',
  standalone: true,
  imports: [AppModule, CommonModule, FormsModule],
})
export class MarblesComponent extends ChildComponent implements AfterViewInit, OnDestroy {
  @ViewChild('boardCanvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('opponentCanvas', { static: false }) opponentCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('splashCanvas', { static: false }) splashCanvasRef!: ElementRef<HTMLCanvasElement>;

  /** Splash-screen marble: a random color + random skin, slowly rolling. */
  private splashColor = 1;
  private splashSeed = 1;
  private splashRoll = 0;

  status: 'splash' | 'menu' | 'lobby' | 'playing' | 'won' = 'splash';
  playerName = '';
  roomCode = '';
  joinCode = '';
  lobby: MarblesLobbyState | null = null;
  mySent = 0;
  myReserve = 0;
  specialColor = 0;
  // Per-match random seed offset for the opponent's board — randomized when a
  // game starts so the opponent's marbles get fresh skins/tints every match.
  private opponentSeedOffset = 0;
  winnerName: string | null = null;
  connected = false;
  /** Smoothed connection health (ping RTT + jitter) for the lobby indicator. */
  latency = 0;
  jitter = 0;
  opponents: MarblesOpponentView[] = [];
  chatMessages: { playerName: string; message: string }[] = [];
  chatDraft = '';
  showHowTo = false;
  isMenuPanelOpen = false;
  /** Mobile: true while the full-screen opponent view is up (tapped the mini
   *  opponent board) — hides the player's board and shows a back button. */
  viewingOpponent = false;
  /** Open public rooms anyone can join (1:1 matches waiting for a challenger). */
  publicRooms: MarblesPublicRoom[] = [];
  /** All-time single-player high scores, best first. */
  highScores: MarblesScore[] = [];
  myBestScore: MarblesScore | null = null;
  highScoresLoading = false;
  /** Marbles cleared this game (from the server board updates). */
  myScore = 0;
  /** True while playing a single-player (vs Computer) game — only these count for high scores. */
  isVsAI = false;
  /** True while playing a same-keyboard local 2P game (P1 arrows+space, P2 A/S/D/W). */
  isLocal2P = false;
  /** Set when the last finished game was single-player (for the win screen copy). */
  lastGameVsAI = false;
  private vsAIDifficulty = 0;
  private gameStartTime = 0;

  /** Player 2's selected center-row marble (local 2P only) — its column shifts
   *  with W/S, the center row rotates with F, and A/D move it along the row. */
  p2SelectedCol = 2;
  /** In-flight pointer drag on Player 2's board (local 2P only). */
  private p2Drag = { active: false, pointerId: -1, col: -1, row: -1, startX: 0, startY: 0, dir: 0, hdir: 0 };
  /** The opponent board state P2 last optimistically predicted (local 2P only). */
  private _predictedOppBoard: number[][] | null = null;
  /** Blocked-shift nudge for P2's column (local 2P only). */
  private p2NudgeCol = -1;
  private p2NudgeDir = 0;
  private p2NudgeT = 0;

  /** Currently selected center-row marble — its column shifts ↑/↓; the center row shifts ←/→. */
  selectedCol = 2;
  /** Arena the boards render on (persisted per browser). */
  selectedMapId = 'classic';
  get boardMaps(): BoardMapTheme[] { return BOARD_MAPS; }
  get boardMap(): BoardMapTheme { return BOARD_MAPS.find(m => m.id === this.selectedMapId) ?? BOARD_MAPS[0]; }
  /** Switch the board arena and remember the choice for next time. */
  selectMap(id: string): void {
    this.selectedMapId = id;
    try { localStorage.setItem('marbles.mapId', id); } catch { /* private mode etc. */ }
    this.playClick();
    this.cdr.detectChanges();
  }

  /** Toggle the Win98-style background music on/off (persisted). Starting the
   *  music needs a user gesture to unlock the AudioContext, so the toggle is
   *  the natural place to kick it off. */
  toggleMusic(): void {
    this.musicOn = !this.musicOn;
    try { localStorage.setItem('marbles.music', this.musicOn ? '1' : '0'); } catch { /* private mode */ }
    if (this.musicOn) {
      this.startMusic();
    } else {
      this.stopMusic();
    }
    this.playClick();
    this.cdr.detectChanges();
  }

  /** Keep the music in sync with the game state: running during a match when
   *  enabled, silent in menus. Called on every status transition. */
  private syncMusic(): void {
    if (this.musicOn && (this.status === 'playing' || this.status === 'won')) {
      this.startMusic();
    } else {
      this.stopMusic();
    }
  }
  /** In-flight pointer drag: dir = vertical (column shift), hdir = horizontal (pitch-row shift). */
  private drag = { active: false, pointerId: -1, col: -1, row: -1, startX: 0, startY: 0, dir: 0, hdir: 0 };

  private ctx!: CanvasRenderingContext2D;
  private sprites: Sprite[] = [];
  /** Shatter bursts for the player's board (drawn + stepped each frame). */
  private _shards: PopShard[] = [];
  /** Shatter bursts for the opponent's board. */
  private _oppShards: PopShard[] = [];
  /** Remaining time on the reserve-dump celebration (player board); 0 = idle. */
  private _dumpBurstT = 0;
  /** Remaining time on the reserve-dump celebration (opponent board); 0 = idle. */
  private _oppDumpBurstT = 0;
  private animId = 0;
  private lastTime = 0;
  private _destroyed = false;
  private _board: number[][] = [];
  /** Opponent's animated marbles + last-seen board (mirrors the player's
   *  sprite pipeline so the computer's moves slide/pop instead of snapping). */
  private _oppSprites: Sprite[] = [];
  private _oppBoard: number[][] = [];
  /** Timing for the opponent's board interpolation: arrival time of its last
   *  update + a smoothed inter-update interval, so its marbles ease across
   *  the gap between updates instead of lurching on network jitter. */
  private _oppLastUpdateMs = 0;
  private _oppIntervalMs = 0;
  /** Opponent snapshots waiting to be played back (jitter buffer): replayed a
   *  fixed delay after arrival so uneven network delivery doesn't stutter the
   *  opponent's board. */
  private _oppQueue: Array<{ view: MarblesOpponentView; at: number }> = [];
  /** The board state we last optimistically predicted for our own move, used
   *  to reconcile (rather than re-animate) when the server confirms it. */
  private _predictedBoard: number[][] | null = null;
  private _spriteSeq = 1;
  private _onResize = () => this.resizeCanvas();
  private _audio: AudioContext | null = null;
  private _publicRoomsTimer: ReturnType<typeof setInterval> | null = null;
  /** Background music toggle (persisted per browser like the arena choice). */
  musicOn = false;
  /** The music scheduler interval + lookahead bookkeeping. */
  private _musicTimer: ReturnType<typeof setInterval> | null = null;
  private _musicStep = 0;
  private _musicNextTime = 0;
  private _musicGain: GainNode | null = null;
  private _musicNoiseBuffer: AudioBuffer | null = null;
  /** Blocked-shift feedback: when a column shift is denied (full column, or a
   *  stack already flush against the edge), the column wiggles briefly in the
   *  attempted direction so the rejection is visible. -1 = no active nudge. */
  private nudgeCol = -1;
  private nudgeT = 0;
  private nudgeDir = 0;

  constructor(private hub: MarblesHubService, private ngZone: NgZone, private cdr: ChangeDetectorRef, private marbles: MarblesService) {
    super();
    this.playerName = this.parentRef?.user?.username ?? '';
    try {
      const saved = localStorage.getItem('marbles.mapId');
      if (saved && BOARD_MAPS.some(m => m.id === saved)) this.selectedMapId = saved;
      this.musicOn = localStorage.getItem('marbles.music') === '1';
    } catch { /* storage unavailable */ }
  }

  ngAfterViewInit(): void {
    // Default the player name to the logged-in user's username. `parentRef`
    // (and its loaded `user`) is only assigned after construction, so read it
    // here rather than in the constructor.
    if (this.parentRef?.user?.username && !this.playerName) {
      this.playerName = this.parentRef.user.username;
    }
    this.resizeCanvas();
    this.initSplash();
    window.addEventListener('resize', this._onResize);

    this.hub.connectionError$.subscribe(() => { this.connected = false; this.cdr.detectChanges(); });
    this.hub.connectionHealth$.subscribe(h => this.ngZone.run(() => {
      this.latency = h.latency;
      this.jitter = h.jitter;
      this.cdr.detectChanges();
    }));
    this.hub.lobbyState$.subscribe(ls => this.ngZone.run(() => this.onLobbyState(ls)));
    this.hub.gameStarted$.subscribe(() => this.ngZone.run(() => {
      this.status = 'playing';
      this.winnerName = null;
      this.isMenuPanelOpen = false;
      this.viewingOpponent = false;
      this.sprites = [];
      this._shards = [];
      this._marbleCache.clear();
      this._oppShards = [];
      this._board = [];
      this._oppSprites = [];
      this._oppBoard = [];
      this._oppLastUpdateMs = 0;
      this._oppIntervalMs = 0;
      this._oppQueue = [];
      this._predictedBoard = null;
      this.opponents = [];
      // Fresh look every game: the opponent's board draws its marbles with a
      // new random skin seed each match (stable within the match).
      this.opponentSeedOffset = Math.floor(Math.random() * 100000) + 1;
      this.myReserve = 0;
      this.mySent = 0;
      this.syncMusic();
      this.cdr.detectChanges();
    }));
    this.hub.boardUpdate$.subscribe(bu => this.ngZone.run(() => this.onBoardUpdate(bu)));
    this.hub.gameWon$.subscribe(w => this.ngZone.run(() => this.onGameWon(w)));
    this.hub.chatMessage$.subscribe(c => this.ngZone.run(() => {
      this.chatMessages.push(c);
      if (this.chatMessages.length > 50) this.chatMessages.shift();
      this.cdr.detectChanges();
    }));

    // Keep the public-room browser fresh while the menu is open.
    this._publicRoomsTimer = setInterval(() => {
      if (this.status === 'menu' || this.status === 'splash') this.refreshPublicRooms();
    }, 4000);
    this.refreshPublicRooms();
    this.loadHighScores();

    this.ngZone.runOutsideAngular(() => {
      this.lastTime = performance.now();
      this.animId = requestAnimationFrame(t => this.loop(t));
    });

    // Deep-link: if the URL carries ?room=CODE, auto-join that room.
    try {
      const room = new URLSearchParams(window.location.search).get('room');
      if (room && room.trim()) {
        this.joinCode = room.trim();
        setTimeout(() => this.joinGame(), 300);
      }
    } catch { /* URLSearchParams unavailable in SSR */ }
  }

  ngOnDestroy(): void {
    this._destroyed = true;
    cancelAnimationFrame(this.animId);
    if (this._publicRoomsTimer) { clearInterval(this._publicRoomsTimer); this._publicRoomsTimer = null; }
    this.stopMusic();
    window.removeEventListener('resize', this._onResize);
    if (this.lobby) this.hub.leaveLobby(this.lobby.code);
    this.hub.disconnect();
    if (this._audio) { this._audio.close(); this._audio = null; }
  }
  /** Copy a shareable link to this room to the clipboard. */
  shareRoom(): void {
    const url = `${window.location.origin}/Marbles?room=${this.roomCode}`;
    navigator.clipboard?.writeText(url).then(() => {
      this.parentRef?.showNotification('Link copied to clipboard!');
    }).catch(() => {
      // Fallback: select + copy from a temporary input
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      this.parentRef?.showNotification('Link copied to clipboard!');
    });
  }

  /** Host a new room. `publicRoom` = appear in the open-room list (1:1),
   *  otherwise a private room joinable only by sharing the code. */
  async hostGame(publicRoom: boolean): Promise<void> {
    await this.join('', publicRoom);
  }

  /** Refresh the list of open public rooms shown in the menu. */
  async refreshPublicRooms(): Promise<void> {
    const rooms = await this.hub.listPublicRooms();
    if (rooms == null) return;
    this.publicRooms = rooms;
    this.cdr.detectChanges();
  }

  /** Jump straight into an open public room from the browser list. */
  async joinPublicRoom(room: MarblesPublicRoom): Promise<void> {
    await this.join(room.code, false);
  }

  /** True when the current room is a public one (vs a private code room). */
  get roomIsPublic(): boolean {
    return this.lobby?.isPublic ?? false;
  }

  /** Colour bucket for the lobby's connection dot, from the smoothed ping. */
  get latencyQuality(): 'good' | 'warn' | 'bad' | 'none' {
    if (!this.latency) return 'none';
    if (this.latency < 80) return 'good';
    if (this.latency < 180) return 'warn';
    return 'bad';
  }

  /** Single-player: host a room, then immediately start vs the computer. */
  async playVsAI(difficulty: number): Promise<void> {
    const name = this.playerName.trim() || 'Player';
    this.playerName = name;
    await this.join('');
    if (!this.connected || !this.roomCode) return;
    this.isVsAI = true;
    this.vsAIDifficulty = difficulty;
    this.gameStartTime = Date.now();
    this.myScore = 0;
    // Randomize before the first board update arrives (the server also fires
    // OnGameStarted, which re-rolls it — either way it lands before rendering).
    this.opponentSeedOffset = Math.floor(Math.random() * 100000) + 1;
    this.hub.startVsAI(this.roomCode, difficulty);
    this.status = 'playing';
    this.winnerName = null;
    this.viewingOpponent = false;
    this.syncMusic();
    this.cdr.detectChanges();
  }

  /** Same-keyboard local 2P: host a private room, then flip it into a local
   *  match. P1 uses arrows + spacebar on the bottom board; P2 uses A/S/D/W
   *  (A/D select, W/S shift column, F rotates the center row) on the top. */
  async playLocal2P(): Promise<void> {
    const name = this.playerName.trim() || 'Player 1';
    this.playerName = name;
    await this.join('');
    if (!this.connected || !this.roomCode) return;
    this.isLocal2P = true;
    this.gameStartTime = Date.now();
    this.myScore = 0;
    this.opponentSeedOffset = Math.floor(Math.random() * 100000) + 1;
    this.hub.startLocal2P(this.roomCode);
    this.status = 'playing';
    this.winnerName = null;
    this.viewingOpponent = false;
    this.p2SelectedCol = 2;
    this.p2NudgeCol = -1;
    this.syncMusic();
    this.cdr.detectChanges();
  }

  async joinGame(): Promise<void> {
    await this.join(this.joinCode.trim());
  }

  private async join(code: string, isPublic = false): Promise<void> {
    const name = this.playerName.trim() || 'Player';
    const userId = this.parentRef?.user?.id ?? 0;
    const res = await this.hub.joinLobby(code, name, userId, isPublic);
    if (!res) {
      this.parentRef?.showNotification('Could not reach the Marbles server.');
      return;
    }
    if (res.error) {
      this.parentRef?.showNotification(res.error);
      return;
    }
    this.connected = true;
    this.roomCode = res.code;
    this.status = res.status === 'playing' ? 'playing' : 'lobby';
    this.lobby = {
      code: res.code, hostConnectionId: res.hostConnectionId, status: res.status, isPublic: res.isPublic, players: res.players,
    };
    this.mySent = res.mySent;
    this.myReserve = res.myReserve;
    this.specialColor = res.mySpecialColor;
    this.myScore = res.myScore ?? 0;
    this.opponents = res.opponents ?? [];
    if (this.status === 'playing') {
      this.applyBoard({ board: res.myBoard, popped: [], rained: 0, dropped: false, specialColor: res.mySpecialColor, reserve: res.myReserve, sent: res.mySent, score: res.myScore, alive: true, winnerName: null });
      const opp = this.opponents[0];
      if (opp) this.applyOpponentBoard(opp);
    }
    this.playClick();
    this.cdr.detectChanges();
  }

  toggleReady(): void {
    if (this.isMeHost()) return;
    this.hub.toggleReady(this.roomCode);
    this.playClick();
  }

  startGame(): void {
    this.hub.startGame(this.roomCode);
    this.playClick();
  }

  /** True while the styled forfeit confirmation dialog is up. */
  showForfeitDialog = false;
  /** What the confirmed forfeit should do: leave to menu or close the game. */
  private forfeitAction: 'menu' | 'close' = 'menu';

  /** Quit gate: a mid-match multiplayer leave is a forfeit (the server hands
   *  the win to the remaining player), so open the styled confirmation dialog
   *  first. Single-player vs the computer and finished games don't forfeit
   *  anything, so they quit straight away. `action` says what the confirmed
   *  forfeit should do ('menu' = leave to menu, 'close' = title-bar ✕). */
  private requestForfeit(action: 'menu' | 'close'): void {
    // Only ONLINE multiplayer matches carry a forfeit (a same-keyboard local
    // game has no ranked opponent to hand the win to, and vs-AI is casual).
    if (this.status === 'playing' && !this.isVsAI && !this.isLocal2P) {
      this.forfeitAction = action;
      this.showForfeitDialog = true;
      this.cdr.detectChanges();
      return;
    }
    this.completeForfeit(action);
  }

  /** Run the forfeit the player just confirmed. */
  private completeForfeit(action: 'menu' | 'close'): void {
    this.showForfeitDialog = false;
    if (action === 'close') {
      this.remove_me('MarblesComponent');
    } else {
      this.leaveToMenu();
    }
  }

  /** 🚪 Quit Match button in the pause menu. */
  confirmQuitMatch(): void {
    this.requestForfeit('menu');
  }

  /** Cancel button on the forfeit dialog — keep playing. */
  cancelForfeit(): void {
    this.showForfeitDialog = false;
    this.playClick();
    this.cdr.detectChanges();
  }

  /** Confirm button on the forfeit dialog. */
  confirmForfeit(): void {
    this.playClick();
    this.completeForfeit(this.forfeitAction);
  }

  /** Title-bar ✕ while mid-match: also a forfeit, so gate it the same way. */
  onTitleBarClose(): void {
    this.requestForfeit('close');
  }

  async leaveToMenu(): Promise<void> {
    if (this.lobby) await this.hub.leaveLobby(this.lobby.code);
    this.hub.disconnect();
    this.lobby = null;
    this.status = 'menu';
    this.isMenuPanelOpen = false;
    this.viewingOpponent = false;
    this.sprites = [];
    this._shards = [];
    this._marbleCache.clear();
    this._oppShards = [];
    this._board = [];
    this._oppSprites = [];
    this._oppBoard = [];
    this._oppLastUpdateMs = 0;
    this._oppIntervalMs = 0;
    this._oppQueue = [];
    this._predictedBoard = null;
    this.opponents = [];
    this.winnerName = null;
    this.isVsAI = false;
    this.isLocal2P = false;
    this._predictedOppBoard = null;
    this.p2NudgeCol = -1;
    this.p2SelectedCol = 2;
    this.lastGameVsAI = false;
    this.myScore = 0;
    this.syncMusic();
    this.loadHighScores();
    this.cdr.detectChanges();
  } 
  
  toMenu(): void {
    this.status = 'menu';
    this.showHowTo = false;
    this.isMenuPanelOpen = false;
    this.syncMusic();
    this.loadHighScores();
    this.cdr.detectChanges();
  }
  backToSplash(): void {
    this.status = 'splash';
    this.initSplash();
    this.syncMusic();
    this.cdr.detectChanges();
  }

  /** Pick a fresh random color + skin for the splash marble and draw it. */
  private initSplash(): void {
    this.splashColor = 1 + Math.floor(Math.random() * 6);
    this.splashSeed = 1 + Math.floor(Math.random() * 100000);
    this.splashRoll = Math.random() * Math.PI * 2;
    this.drawSplash();
  }

  /** Render the splash marble into its canvas (DPR-aware, soft fall shadow). */
  private drawSplash(): void {
    const canvas = this.splashCanvasRef?.nativeElement;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = 220;
    if (canvas.width !== size * dpr) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    // Soft drop shadow under the marble.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(size / 2, size / 2 + 86, 70, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    this.drawMarble(ctx, size / 2, size / 2, 88, this.splashColor, this.splashRoll, this.splashSeed, 0);
    this.drawSplashGlint(ctx, size / 2, size / 2, 88);
  }

  /** Periodic specular shine sweeping across the splash marble — a thin,
   *  slightly-tilted streak that fades in as it enters the sphere and out as
   *  it leaves, once every ~4 seconds, clipped to the marble's circle so it
   *  reads as light glinting off the glass rather than a moving bar. */
  private drawSplashGlint(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    const period = 4;   // seconds between glint sweeps
    const sweep = 0.9;  // seconds the streak takes to cross the marble
    const t = (performance.now() / 1000) % period;
    if (t > sweep) return; // resting between sweeps
    const u = t / sweep;   // 0..1 across the sweep
    const intensity = Math.sin(Math.PI * u); // fade in → peak mid-cross → fade out
    const bandW = r * 0.55;
    const gx = cx - r * 1.25 + u * (r * 2.5); // streak center travels left → right
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(gx, cy);
    ctx.rotate(-0.32); // slight diagonal tilt
    ctx.globalAlpha = 0.4 * intensity;
    const grad = ctx.createLinearGradient(-bandW / 2, 0, bandW / 2, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, '#ffffff');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(-bandW / 2, -r * 1.3, bandW, r * 2.6);
    ctx.restore();
  }
  toggleHowTo(): void { this.showHowTo = !this.showHowTo; this.playClick(); this.cdr.detectChanges(); }

  showMenuPanel(): void {
    if (this.isMenuPanelOpen) { this.closeMenuPanel(); return; }
    this.isMenuPanelOpen = true;
    // Freeze the match on the server so marbles don't keep raining (or the
    // AI keep playing) while the explainer popup is open. The drop loop, AI
    // loop and player shifts all stall until the menu closes.
    if (this.status === 'playing') this.hub.pauseGame(this.roomCode);
    this.playClick();
    this.cdr.detectChanges();
  }

  closeMenuPanel(): void {
    if (!this.isMenuPanelOpen) return;
    this.isMenuPanelOpen = false;
    if (this.status === 'playing') this.hub.resumeGame(this.roomCode);
    this.cdr.detectChanges();
  }

  sendChat(): void {
    const msg = this.chatDraft.trim();
    if (!msg) return;
    this.hub.sendChat(this.roomCode, msg);
    this.chatDraft = '';
  }

  isMeHost(): boolean {
    return this.lobby?.hostConnectionId === this.hub.myConnectionId;
  }

  otherPlayers(): MarblesPlayer[] {
    const me = this.hub.myConnectionId;
    return (this.lobby?.players ?? []).filter(p => p.connectionId !== me);
  }

  /** The opponent whose board is shown side-by-side / in the corner (first opponent). */
  get opponent(): MarblesOpponentView | null {
    return this.opponents[0] ?? null;
  }

  hotColorCss(): string {
    const base = COLORS[this.specialColor] ?? COLORS[1];
    return `radial-gradient(circle at 32% 28%, ${lighten(base, 0.55)}, rgb(${base[0]},${base[1]},${base[2]}) 55%, ${darken(base, 0.5)})`;
  }
  /** Display name for the per-game hot (special) color id (1..6). */
  hotColorName(): string {
    return { 1: 'Red', 2: 'Orange', 3: 'Yellow', 4: 'Green', 5: 'Blue', 6: 'Black' }[this.specialColor] ?? '';
  }

  /** Cap for the graphical "marbles sent" row — extra sends show as a +N badge. */
  sentPipMax = 10;
  sentPips(): number[] {
    return Array.from({ length: Math.min(this.sentPipMax, this.mySent) }, (_, i) => i);
  }
  get sentPipOverflow(): number {
    return Math.max(0, this.mySent - this.sentPipMax);
  }
  /** CSS marble look for the i-th sent pip, cycling through the game colours. */
  sentMarbleBg(i: number): string {
    const c = COLORS[1 + (i % (COLORS.length - 1))];
    return `radial-gradient(circle at 32% 28%, ${lighten(c, 0.6)}, rgb(${c[0]},${c[1]},${c[2]}) 55%, ${darken(c, 0.45)})`;
  }

  /** Cap for the graphical "reserve" row — extra reserve shows as a +N badge. */
  reservePipMax = 10;
  reservePips(): number[] {
    return Array.from({ length: Math.min(this.reservePipMax, this.myReserve) }, (_, i) => i);
  }
  get reservePipOverflow(): number {
    return Math.max(0, this.myReserve - this.reservePipMax);
  }
  /** Reserve pips are all the current hot colour (they're the marbles you've
   *  collected and will dump on a full 5-row match). */
  reserveMarbleBg(): string {
    return this.hotColorCss();
  }

  /** A single shared pulse phase for the pitch-row highlight and the
   *  hot-marble glow, so the match zone and the special colour breathe in
   *  lockstep instead of drifting out of sync. */
  private pulsePhase(): number {
    return 0.5 + 0.5 * Math.sin(performance.now() * 0.007);
  }

  // ── Hub events ──────────────────────────────────────────────────────────

  private onLobbyState(ls: MarblesLobbyState): void {
    this.lobby = ls;
    this.roomCode = ls.code;
    if (this.status === 'menu' || this.status === 'splash') this.status = 'lobby';
    this.cdr.detectChanges();
  }

  private onBoardUpdate(bu: MarblesBoardUpdate): void {
    this.mySent = bu.sent;
    this.myReserve = bu.reserve;
    this.specialColor = bu.specialColor;
    this.myScore = bu.score ?? this.myScore;
    this.opponents = bu.opponents ?? [];
    if (bu.dropped) this.playDrop();
    if (bu.rained > 0) this.playRain(bu.rained);
    if ((bu.popped?.length ?? 0) > 0) this.playPop(bu.popped.length);
    if ((bu.reserveDump ?? 0) > 0) this.triggerDumpBurst();

    // Dead-reckoning reconcile: if this update is the server confirming a
    // board we already predicted (and nothing else changed it — no pops,
    // drops or rain), our sprites are already animating toward it, so skip
    // the re-match instead of re-running the slide.
    const confirmsPrediction = this._predictedBoard !== null && boardsEqual(bu.board, this._predictedBoard);
    if (confirmsPrediction) {
      this._board = bu.board;
    } else {
      this.applyBoard(bu);
    }
    this._predictedBoard = null;

    // Queue the opponent's snapshot in the jitter buffer: it's replayed a
    // fixed delay later in the render loop (with its quiet sounds) so uneven
    // delivery doesn't make the computer's side stutter. In a local 2P game
    // there's no network jitter — the same connection feeds both boards — so
    // apply P2's board instantly and reconcile any optimistic prediction.
    const opp = this.opponents[0];
    if (opp) {
      if (this.isLocal2P) {
        this.applyLocalOpponent(opp);
      } else {
        this._oppQueue.push({ view: opp, at: performance.now() });
      }
    }
    this.cdr.detectChanges();
  }

  /** Local 2P: apply P2's board the moment the server confirms it (no jitter
   *  buffer). If it matches what P2 optimistically predicted, the sprites are
   *  already sliding there, so just adopt the authoritative board; otherwise
   *  re-match. P2 is a human on the same machine, so sounds are full-volume. */
  private applyLocalOpponent(opp: MarblesOpponentView): void {
    const confirmsPrediction = this._predictedOppBoard !== null && boardsEqual(opp.board, this._predictedOppBoard);
    if (confirmsPrediction) {
      this._oppBoard = opp.board;
    } else {
      this.applyOpponentBoard(opp);
    }
    this._predictedOppBoard = null;
    if (opp.dropped) this.playDrop();
    if (opp.rained > 0) this.playRain(opp.rained);
    if ((opp.popped?.length ?? 0) > 0) this.playPop(opp.popped.length);
    if ((opp.reserveDump ?? 0) > 0) this.triggerOpponentDumpBurst();
  }

  private onGameWon(w: { winnerName: string }): void {
    this.winnerName = w.winnerName;
    this.status = 'won';
    this.isMenuPanelOpen = false;
    const iWon = this.winnerName === (this.lobby?.players.find(p => p.connectionId === this.hub.myConnectionId)?.playerName ?? '');
    // Local 2P: both players share this screen, so a finished match just plays
    // the celebratory jingle — there's no single "you" to be sad for.
    if (iWon || this.isLocal2P) this.playWin(); else this.playLose();
    // Only single-player (vs Computer) games count toward the leaderboard.
    this.lastGameVsAI = this.isVsAI;
    if (this.isVsAI) {
      this.submitScore();
    }
    this.syncMusic();
    this.cdr.detectChanges();
  }

  /** Record the finished single-player game on the all-time leaderboard. */
  private async submitScore(): Promise<void> {
    const score = this.myScore;
    const difficulty = this.vsAIDifficulty;
    const durationSeconds = Math.max(0, Math.round((Date.now() - this.gameStartTime) / 1000));
    this.isVsAI = false;
    if (score <= 0) return;
    const err = await this.marbles.addScore({
      userId: this.parentRef?.user?.id ?? 0,
      username: this.playerName,
      score,
      difficulty,
      durationSeconds,
    });
    if (err) this.parentRef?.showNotification('Could not save your Marbles high score.');
  }

  /** Fetch the all-time single-player leaderboard (all players). */
  async loadHighScores(): Promise<void> {
    this.highScoresLoading = true;
    const res = await this.marbles.getHighScores(this.parentRef?.user?.id ?? 0);
    this.highScoresLoading = false;
    if (!res) return;
    this.highScores = res.scores ?? [];
    this.myBestScore = res.myBest ?? null;
    this.cdr.detectChanges();
  }

  difficultyLabel(d: number): string {
    switch (d) {
      case 1: return 'Medium';
      case 2: return 'Hard';
      default: return 'Easy';
    }
  }

  // ── Board + sprites ─────────────────────────────────────────────────────

  private applyBoard(bu: { board: number[][]; popped: { row: number; col: number; color: number }[]; rained?: number; dropped?: boolean; dropSide?: number; rowShifted?: number; specialColor?: number; reserve?: number; sent?: number; score?: number; alive?: boolean; winnerName?: string | null }): void {
    const oldBoard = this._board;
    this._board = bu.board;
    if (bu.rowShifted && (bu.popped?.length ?? 0) === 0 && this.isPureRowShift(oldBoard, bu.board, bu.rowShifted)) {
      this.sprites = this.matchPureRowShiftSprites(this.sprites, bu.board, oldBoard, bu.rowShifted);
    } else {
      this.sprites = this.matchSpritesToBoard(this.sprites, bu.board, oldBoard, bu.popped ?? [], bu.rowShifted ?? 0, 0, bu.dropSide ?? 0);
    }
  }

  /** Animate the opponent's board the same way as the player's: match the
   *  previous sprites to the new board and slide/pop/spawn them. The move
   *  duration is derived from the measured interval between opponent updates
   *  (EMA-smoothed, clamped) so its marbles ease across the gap between
   *  updates and stay smooth under network jitter instead of lurching. */
  private applyOpponentBoard(opp: MarblesOpponentView): void {
    const oldBoard = this._oppBoard;
    this._oppBoard = opp.board;

    const now = performance.now();
    if (this._oppLastUpdateMs > 0) {
      const interval = Math.min(2000, Math.max(120, now - this._oppLastUpdateMs));
      this._oppIntervalMs = this._oppIntervalMs > 0
        ? this._oppIntervalMs * 0.55 + interval * 0.45
        : interval;
    }
    this._oppLastUpdateMs = now;
    // Fill most of the expected gap, but cap it so a slow AI (up to ~2s
    // between moves) doesn't make a one-cell slide crawl. The higher cap lets
    // the move after a network stall glide across the whole gap instead of
    // snapping, which reads as smooth recovery rather than a hitch.
    const moveDur = Math.round(Math.min(1200, Math.max(220, this._oppIntervalMs || 350)));

    if (opp.rowShifted && (opp.popped?.length ?? 0) === 0 && this.isPureRowShift(oldBoard, opp.board, opp.rowShifted)) {
      this._oppSprites = this.matchPureRowShiftSprites(this._oppSprites, opp.board, oldBoard, opp.rowShifted, moveDur);
    } else {
      this._oppSprites = this.matchSpritesToBoard(this._oppSprites, opp.board, oldBoard, opp.popped ?? [], opp.rowShifted ?? 0, moveDur, opp.dropSide ?? 0);
    }
  }

  /** True when the authoritative update only rotates the pitch row. */
  private isPureRowShift(oldBoard: number[][], newBoard: number[][], dir: number): boolean {
    if (oldBoard.length !== ROWS || newBoard.length !== ROWS) return false;
    for (let r = 0; r < ROWS; r++) {
      if (!oldBoard[r] || !newBoard[r] || oldBoard[r].length !== COLS || newBoard[r].length !== COLS) return false;
      for (let c = 0; c < COLS; c++) {
        const expected = r === PITCH_ROW
          ? oldBoard[r][(c - dir + COLS) % COLS]
          : oldBoard[r][c];
        if (newBoard[r][c] !== expected) return false;
      }
    }
    return true;
  }

  /**
   * Rotate a clean pitch row by mapping every existing sprite from its exact
   * source cell to its exact destination. This avoids color-based matching,
   * which is ambiguous when adjacent marbles share a color and can otherwise
   * leave survivors unmatched and make them respawn from above.
   */
  private matchPureRowShiftSprites(sprites: Sprite[], newBoard: number[][], oldBoard: number[][], dir: number, moveDur = 0): Sprite[] {
    const live = sprites.filter(s => s.phase !== 'pop');
    const byCell = new Map<string, Sprite>();
    for (const s of live) {
      const row = Math.round(s.tRow);
      const col = Math.round(s.tCol);
      byCell.set(`${row},${col}`, s);
    }

    const next: Sprite[] = [];
    const used = new Set<Sprite>();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const color = newBoard[r]?.[c] ?? 0;
        if (!color) continue;
        const sourceCol = r === PITCH_ROW ? (c - dir + COLS) % COLS : c;
        const sprite = byCell.get(`${r},${sourceCol}`);
        if (!sprite || sprite.color !== color || used.has(sprite)) {
          // This should only be reachable if an update arrived while a prior
          // animation was still being reconciled; let the general matcher
          // handle that exceptional snapshot rather than inventing a spawn.
          return this.matchSpritesToBoard(sprites, newBoard, oldBoard, [], dir, moveDur);
        }
        used.add(sprite);
        this.setTarget(sprite, c, r, moveDur);
        next.push(sprite);
      }
    }

    // A pure row shift cannot create or remove marbles. Keep any already-popping
    // visual effects alive until their normal animation cleanup removes them.
    for (const sprite of sprites) {
      if (sprite.phase === 'pop') next.push(sprite);
    }
    return next;
  }

  /** Match a set of sprites to a new board, producing the animated targets.
   *  Shared by the player's board and the opponent's board so both animate
   *  identically. */
  private matchSpritesToBoard(
    sprites: Sprite[],
    newBoard: number[][],
    oldBoard: number[][],
    popped: { row: number; col: number; color: number }[],
    rowShifted: number,
    moveDur = 0,
    dropSide = 0,
  ): Sprite[] {
    // 1. Mark sprites sitting on popped cells → pop animation. The popped
    //    list uses post-move coordinates, so match against the sprite's
    //    TARGET cell (tRow/tCol — where it logically is or is heading), not
    //    its mid-animation row/col. Reading the animated position here meant
    //    a marble sliding along the pitch row got keyed to the wrong column
    //    while the confirm arrived, so it escaped the pop and stole a
    //    surviving marble's cell instead — the surviving marble was then
    //    popped, which is why marbles vanished during row shifts.
    const poppedKeys = new Set<string>();
    for (const p of popped) poppedKeys.add(`${p.row},${p.col}:${p.color}`);
    // Stagger each run so its marbles shatter left→right / top→bottom in
    // sequence rather than all at once.
    const popDelays = this.popDelaysFor(popped);
    for (const s of sprites) {
      if (poppedKeys.has(`${s.tRow},${s.tCol}:${s.color}`)) {
        s.phase = 'pop';
        s.popDelay = popDelays.get(`${s.tRow},${s.tCol}`) ?? 0.05;
        s.popT = 0;
        s.broken = false;
      }
    }

    // 2. Match surviving marbles to the new board. Movement is
    //    order-preserving within a column (see phase 2), so the whole column
    //    shifts/falls in unison. Newly added cells spawn as fresh marbles.
    //
    //    Movement rules: a marble may only move within its own column (gravity,
    //    column shifts, drops) — the only exception is a marble sliding ALONG
    //    the pitch row, which is only legitimate when the server says a row
    //    shift happened this turn (rowShifted != 0). A drop adds a marble to a
    //    single column and must never "steal" a same-colored marble from a
    //    neighbor column, so without rowShifted every column is matched
    //    strictly on its own pool.
    const live = sprites.filter(s => s.phase !== 'pop');
    const used = new Set<Sprite>();
    const next: Sprite[] = [];

    // Phase 1: on a real row shift, match the pitch-row cells to marbles that
    // rotate into them horizontally (the whole row slides). Only these cells
    // may be filled from a neighbor column.
    const slideFilled = new Set<number>();
    if (rowShifted !== 0) {
      for (let c = 0; c < COLS; c++) {
        const color = newBoard[PITCH_ROW]?.[c] ?? 0;
        if (!color) continue;
        let best: Sprite | null = null;
        let bestDist = Infinity;
        for (const s of live) {
          if (used.has(s) || s.color !== color || s.tRow !== PITCH_ROW) continue;
          // Steps along the rotation direction to reach this cell. In a
          // clean ±1 rotation the arriving marble is exactly 1 step away;
          // a marble already sitting here (0 steps) means a duplicate
          // color — prefer the one that actually rotates into the cell so
          // the row slides as a whole instead of crossing paths.
          const steps = ((c - s.tCol) * rowShifted + COLS) % COLS;
          const dist = (steps + COLS - 1) % COLS;
          if (dist < bestDist) { bestDist = dist; best = s; }
        }
        if (best) {
          used.add(best);
          this.setTarget(best, c, PITCH_ROW, moveDur);
          next.push(best);
          slideFilled.add(c);
        }
      }
    }

    // Phase 2: vertical movement within each column. Marbles only ever travel
    // straight up/down inside their own column (gravity, column shifts, drops)
    // and the server preserves their relative order, so pair old marbles to
    // new cells in the SAME order, matching from the bottom up. The old
    // greedy closest-first search crossed two same-colored marbles — the
    // second one slid 2-3 extra cells while the rest of the column moved in
    // unison. Order-preserving pairing keeps a whole column shifting together.
    for (let c = 0; c < COLS; c++) {
      const colLive = live
        .filter(s => s.tCol === c && !used.has(s))
        .sort((a, b) => a.tRow - b.tRow); // top → bottom
      const cells: { r: number; color: number }[] = [];
      for (let r = 0; r < ROWS; r++) {
        const color = newBoard[r]?.[c] ?? 0;
        if (!color) continue;
        if (r === PITCH_ROW && slideFilled.has(c)) continue;
        cells.push({ r, color });
      }
      // Column alignment: column shifts only ever SLIDE a stack as a unit (no
      // wrapping), so a surviving column's colour order is always preserved.
      // A drop can enter a column from the TOP (marble stacks on the pile —
      // cellSeq = [extraCells] + spriteSeq) or from the BOTTOM (the pile is
      // pushed up and the marble takes the bottom cell — cellSeq = spriteSeq
      // + [extraCells]). Try the alignment the server reported first
      // (dropSide) so the entering marble rolls in from the correct edge,
      // then the other. This is what makes a falling/sliding marble GLIDE to
      // its new cell instead of being popped and re-spawned (which is what
      // left phantom holes and swapped marble skins). Falls (extra = 0) are
      // handled here too; only mixed cases fall through to the
      // order-preserving bottom-up pairing below.
      const spriteColors = colLive.map(s => s.color);
      const cellColors = cells.map(x => x.color);
      let columnHandled = false;
      if (spriteColors.length > 0 && cellColors.length >= spriteColors.length) {
        const extra = cellColors.length - spriteColors.length;
        const orders: { bottom: boolean }[] = dropSide === 1
          ? [{ bottom: true }, { bottom: false }]
          : [{ bottom: false }, { bottom: true }];
        for (const { bottom } of orders) {
          if (columnHandled) break;
          // Column order is always preserved (no wrapping), so the surviving
          // sprites pair 1:1 with the non-extra cells in order.
          let ok = true;
          for (let i = 0; i < spriteColors.length; i++) {
            const cellIdx = bottom ? i : extra + i;
            if (cellColors[cellIdx] !== spriteColors[i]) { ok = false; break; }
          }
          if (ok) {
            columnHandled = true;
            for (let j = 0; j < spriteColors.length; j++) {
              const s = colLive[j];
              const cell = bottom ? cells[j] : cells[extra + j];
              used.add(s);
              this.setTarget(s, c, cell.r, moveDur);
              next.push(s);
            }
            if (bottom) {
              // New marble(s) sit at the BOTTOM of the column — spawn below
              // the board and roll up into place.
              for (let i = spriteColors.length; i < cells.length; i++) {
                next.push(this.newSprite(cells[i].color, c, cells[i].r, moveDur, true));
              }
            } else {
              for (let i = extra - 1; i >= 0; i--) {
                next.push(this.newSprite(cells[i].color, c, cells[i].r, moveDur));
              }
            }
          }
        }
      }
      if (!columnHandled) {
        // Pair surviving marbles to cells bottom-up, REQUIRING matching colours.
        // Gravity preserves the bottom-up order of survivors, so aligned pairs
        // glide together; a colour mismatch means a marble popped (its colour
        // vanished from the column) or a cell is new (a drop/rain arrived).
        // Popped sprites are left unmatched so phase 3 pops them, and new cells
        // spawn fresh marbles — a marble is never repainted into a different
        // colour, which is what made some columns act differently and made
        // marbles slide along the wrong axis.
        let si = colLive.length - 1;
        let ci = cells.length - 1;
        while (si >= 0 && ci >= 0) {
          const s = colLive[si];
          const cell = cells[ci];
          if (s.color === cell.color) {
            used.add(s);
            this.setTarget(s, c, cell.r, moveDur);
            next.push(s);
            si--; ci--;
            continue;
          }
          // Work out which side is the extra item by checking whether its colour
          // still exists among the remaining (higher) entries of the other list.
          const spriteStillNeeded = cells.slice(0, ci + 1).some(x => x.color === s.color);
          const cellHasSprite = colLive.slice(0, si + 1).some(x => x.color === cell.color);
          if (!spriteStillNeeded) {
            // This marble popped — leave it for phase 3.
            si--;
          } else if (!cellHasSprite) {
            // This cell is a freshly dropped/rained marble.
            next.push(this.newSprite(cell.color, c, cell.r, moveDur, dropSide === 1));
            ci--;
          } else {
            // Both colours exist elsewhere (ambiguous) — pop the sprite to stay
            // consistent rather than repaint it.
            si--;
          }
        }
        // Any cells higher up the column are newly added marbles.
        for (; ci >= 0; ci--) {
          next.push(this.newSprite(cells[ci].color, c, cells[ci].r, moveDur));
        }
      }
    }

    // 3. Unmatched live sprites must have popped → pop them. These are cascade
    //    leftovers whose coords don't match the primary run, so give them a
    //    short positional stagger after the main run breaks.
    for (const s of sprites) {
      if (s.phase === 'pop') { next.push(s); continue; }
      if (!used.has(s)) {
        s.phase = 'pop';
        s.popDelay = 0.16 + s.tCol * 0.05;
        s.popT = 0;
        s.broken = false;
        next.push(s);
      }
    }

    return next;
  }

  private newSprite(color: number, col: number, toRow: number, moveDur = 0, fromBottom = false): Sprite {
    // Spawn just off the board on the side the marble enters: above it to
    // fall in from the top, or below it to roll up from the bottom.
    const fromRow = fromBottom
      ? ROWS + (ROWS - 1 - toRow)
      : -1 - (ROWS - 1 - toRow);
    return {
      id: this._spriteSeq++,
      color,
      col,
      row: fromRow,
      tCol: col,
      tRow: toRow,
      fromCol: col,
      fromRow,
      moveT: 0,
      moveDur,
      scale: 1,
      roll: 0,
      stretch: 1,
      phase: 'move',
      popDelay: 0,
      popT: 0,
      broken: false,
    };
  }

  /** Point a sprite at a new target. With a timed move (moveDur > 0) the start
   *  position and clock are captured so it eases from wherever it currently is;
   *  without one it falls back to the legacy fixed-speed glide. */
  private setTarget(s: Sprite, tCol: number, tRow: number, moveDur: number): void {
    s.tCol = tCol;
    s.tRow = tRow;
    if (moveDur > 0) {
      s.fromCol = s.col;
      s.fromRow = s.row;
      s.moveT = 0;
      s.moveDur = moveDur;
    }
    s.phase = 'move';
  }

  // ── Controls ────────────────────────────────────────────────────────────

  shiftRow(dir: number): void {
    if (this.status !== 'playing') return;
    this.playClick();
    // Row shifts are reconciled from the authoritative update. Predicting them
    // locally can race a drop update and make the same board appear to change
    // twice, which causes unrelated marbles to be treated as new spawns.
    this.hub.shiftRow(this.roomCode, dir);
  }

  shiftColumn(dir: number): void {
    if (this.status !== 'playing') return;
    // A denied shift gets a nudge wiggle + dull thud instead of the click, so
    // it's obvious the move was blocked rather than silently ignored.
    if (!this.predictColumnShift(this.selectedCol, dir)) {
      this.playDeny();
      this.triggerNudge(this.selectedCol, dir);
    } else {
      this.playClick();
    }
    this.hub.shiftColumn(this.roomCode, this.selectedCol, dir);
  }

  /** Optimistically apply a pitch-row slide to our local board + sprites,
   *  mirroring the server's ShiftRowOn so the confirmation reconciles 1:1. */
  private predictRowShift(dir: number): void {
    if (!this._board || this._board.length !== ROWS) return;
    const oldBoard = this._board;
    const nb = cloneBoard(oldBoard);
    const newRow = new Array<number>(COLS);
    for (let c = 0; c < COLS; c++) {
      newRow[c] = nb[PITCH_ROW][(c - dir + COLS) % COLS];
    }
    for (let c = 0; c < COLS; c++) nb[PITCH_ROW][c] = newRow[c];
    // Rotating the pitch row only swaps the marbles sitting in it — never
    // re-centre the columns (that would undo a column the player floated).
    this._board = nb;
    this._predictedBoard = nb;
    this.sprites = this.matchSpritesToBoard(this.sprites, nb, oldBoard, [], dir);
  }

  /** Returns true if the column shift was applied, false if it was blocked
   *  (empty column, full column, or a stack flush against the edge in that
   *  direction) — mirroring the server's ShiftColumnOn 1:1 (marbles never
   *  wrap; a partial stack slides as one unit within the column's bounds). */
  private predictColumnShift(col: number, dir: number): boolean {
    if (!this._board || this._board.length !== ROWS || col < 0 || col >= COLS) return false;
    const oldBoard = this._board;
    const nb = cloneBoard(oldBoard);
    let top = -1;
    for (let r = 0; r < ROWS; r++) {
      if (nb[r][col] !== 0) { top = r; break; }
    }
    if (top < 0) return false; // empty column
    let bottom = top;
    for (let r = ROWS - 1; r > top; r--) {
      if (nb[r][col] !== 0) { bottom = r; break; }
    }
    const len = bottom - top + 1;
    if (len >= ROWS) return false; // full column — blocked
    if (dir <= 0) {
      if (top === 0 || bottom === PITCH_ROW) return false; // edge, or would vacate the pitch row
      for (let r = top; r <= bottom; r++) nb[r - 1][col] = nb[r][col];
      nb[bottom][col] = 0;
    } else {
      if (bottom === ROWS - 1 || top === PITCH_ROW) return false; // edge, or would vacate the pitch row
      for (let r = bottom; r >= top; r--) nb[r + 1][col] = nb[r][col];
      nb[top][col] = 0;
    }
    this._board = nb;
    this._predictedBoard = nb;
    this.sprites = this.matchSpritesToBoard(this.sprites, nb, oldBoard, [], 0);
    return true;
  }

  /** Kick off the blocked-shift wiggle for a column in the attempted
   *  direction. The animation runs in the render loop (nudgeT) and is applied
   *  as a vertical offset while drawing that column's marbles. */
  private triggerNudge(col: number, dir: number): void {
    this.nudgeCol = col;
    this.nudgeDir = dir;
    this.nudgeT = 0;
  }

  /** Vertical offset (in cells, + = down) for a sprite mid-nudge. A damped
   *  sine gives a bump-and-spring-back wiggle: out in the attempted direction
   *  and back, settling quickly. */
  private nudgeOffset(): number {
    if (this.nudgeCol < 0) return 0;
    const p = Math.min(1, this.nudgeT / NUDGE_DUR);
    return this.nudgeDir * 0.22 * Math.sin(p * Math.PI) * (1 - p);
  }

  selectColumn(c: number): void {
    this.selectedCol = c;
    this.playClick();
  }

  /** Move the center-row cursor (the selected marble) one column left/right,
   *  wrapping around the edges. This is the handle that ↑/↓ column shifts act
   *  on. Desktop ←/→ drives it; mobile taps drive it directly. */
  moveCursor(dir: number): void {
    if (this.status !== 'playing') return;
    this.selectColumn((this.selectedCol + dir + COLS) % COLS);
  }

  /** Mobile: tapping the mini opponent board expands it to a full-screen
   *  read-only view (the player's board is hidden until they go back). */
  viewOpponent(): void {
    if ((this.status === 'playing' || this.status === 'won')
      && window.matchMedia('(max-width: 900px)').matches) {
      this.viewingOpponent = true;
    }
  }

  backToMyBoard(): void {
    this.viewingOpponent = false;
    this.playClick();
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent): void {
    if (this.status !== 'playing') return;
    // Ignore input while the in-game menu is open — the match is paused and
    // the popup owns the keyboard.
    if (this.isMenuPanelOpen) return;
    // Every move needs a fresh press — ignore OS key auto-repeat so holding an
    // arrow key can't chain cursor moves or column shifts.
    if (e.repeat) return;
    const k = e.key;
    // ← / → move the center-row cursor (the selection handle); ↑ / ↓ shift
    // that column up/down. Row sliding stays on Space and the on-screen ◀/▶.
    if (k === 'ArrowLeft') { e.preventDefault(); this.moveCursor(-1); }
    else if (k === 'ArrowRight') { e.preventDefault(); this.moveCursor(1); }
    else if (k === 'ArrowUp') { e.preventDefault(); this.shiftColumn(-1); }
    else if (k === 'ArrowDown') { e.preventDefault(); this.shiftColumn(1); }
    else if (k === ' ') { e.preventDefault(); this.shiftRow(1); }
    else if (k >= '1' && k <= '5') { this.selectColumn(+k - 1); }
    // Local 2P — Player 2 drives the opponent board: A/D select the column,
    // W/S shift that column, F rotates the center row (mirrors P1's spacebar).
    else if (this.isLocal2P) {
      const lk = k.toLowerCase();
      if (lk === 'a') { e.preventDefault(); this.moveP2Cursor(-1); }
      else if (lk === 'd') { e.preventDefault(); this.moveP2Cursor(1); }
      else if (lk === 'w') { e.preventDefault(); this.shiftP2Column(-1); }
      else if (lk === 's') { e.preventDefault(); this.shiftP2Column(1); }
      else if (lk === 'f') { e.preventDefault(); this.shiftP2Row(1); }
    }
  }

  /** Move Player 2's center-row cursor one column left/right (local 2P). */
  private moveP2Cursor(dir: number): void {
    if (this.status !== 'playing' || !this.isLocal2P) return;
    this.p2SelectedCol = (this.p2SelectedCol + dir + COLS) % COLS;
    this.playClick();
  }

  /** Player 2 rotates the center row (local 2P) — the same optimistic
   *  prediction + server slot=1 round-trip used for column shifts. */
  private shiftP2Row(dir: number): void {
    if (this.status !== 'playing' || !this.isLocal2P) return;
    this.playClick();
    // The authoritative opponent update carries rowShifted, so use the same
    // exact row remapping as P1 instead of racing a local prediction.
    this.hub.shiftRow(this.roomCode, dir, 1);
  }

  /** Player 2 shifts a column (local 2P). A blocked shift nudges + denies
   *  just like P1's; otherwise the move is predicted optimistically and the
   *  server confirms it (slot 1 targets the local partner's board). */
  private shiftP2Column(dir: number): void {
    if (this.status !== 'playing' || !this.isLocal2P) return;
    if (!this.predictP2ColumnShift(this.p2SelectedCol, dir)) {
      this.playDeny();
      this.triggerP2Nudge(this.p2SelectedCol, dir);
    } else {
      this.playClick();
    }
    this.hub.shiftColumn(this.roomCode, this.p2SelectedCol, dir, 1);
  }

  /** Optimistically rotate P2's center row on the opponent board (mirrors
   *  predictRowShift, which the server's slot=1 move confirms 1:1). */
  private predictP2RowShift(dir: number): void {
    if (!this._oppBoard || this._oppBoard.length !== ROWS) return;
    const oldBoard = this._oppBoard;
    const nb = cloneBoard(oldBoard);
    const newRow = new Array<number>(COLS);
    for (let c = 0; c < COLS; c++) newRow[c] = nb[PITCH_ROW][(c - dir + COLS) % COLS];
    for (let c = 0; c < COLS; c++) nb[PITCH_ROW][c] = newRow[c];
    this._oppBoard = nb;
    this._predictedOppBoard = nb;
    this._oppSprites = this.matchSpritesToBoard(this._oppSprites, nb, oldBoard, [], dir);
  }

  /** Optimistically shift a column on the opponent board for P2. Mirrors
   *  predictColumnShift (marbles never wrap; full/flush stacks are blocked).
   *  Returns false when the shift is blocked so the client can deny+nudge. */
  private predictP2ColumnShift(col: number, dir: number): boolean {
    if (!this._oppBoard || this._oppBoard.length !== ROWS || col < 0 || col >= COLS) return false;
    const oldBoard = this._oppBoard;
    const nb = cloneBoard(oldBoard);
    let top = -1;
    for (let r = 0; r < ROWS; r++) {
      if (nb[r][col] !== 0) { top = r; break; }
    }
    if (top < 0) return false; // empty column
    let bottom = top;
    for (let r = ROWS - 1; r > top; r--) {
      if (nb[r][col] !== 0) { bottom = r; break; }
    }
    const len = bottom - top + 1;
    if (len >= ROWS) return false; // full column — blocked
    if (dir <= 0) {
      if (top === 0 || bottom === PITCH_ROW) return false; // edge, or would vacate the pitch row
      for (let r = top; r <= bottom; r++) nb[r - 1][col] = nb[r][col];
      nb[bottom][col] = 0;
    } else {
      if (bottom === ROWS - 1 || top === PITCH_ROW) return false; // edge, or would vacate the pitch row
      for (let r = bottom; r >= top; r--) nb[r + 1][col] = nb[r][col];
      nb[top][col] = 0;
    }
    this._oppBoard = nb;
    this._predictedOppBoard = nb;
    this._oppSprites = this.matchSpritesToBoard(this._oppSprites, nb, oldBoard, [], 0);
    return true;
  }

  /** Kick off the blocked-shift wiggle for P2's column (local 2P). */
  private triggerP2Nudge(col: number, dir: number): void {
    this.p2NudgeCol = col;
    this.p2NudgeDir = dir;
    this.p2NudgeT = 0;
  }

  /** Vertical offset (in cells, + = down) for a sprite mid-nudge on P2's
   *  board — same damped sine bump as P1's, drawn on the opponent canvas. */
  private p2NudgeOffset(): number {
    if (this.p2NudgeCol < 0) return 0;
    const p = Math.min(1, this.p2NudgeT / NUDGE_DUR);
    return this.p2NudgeDir * 0.22 * Math.sin(p * Math.PI) * (1 - p);
  }

  /** Map a pointer event to board grid coordinates (handles DPR-scaled canvas). */
  private pointerToCell(e: PointerEvent): { col: number; row: number; px: number; py: number } | null {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const { cell, ox, oy } = this.layout();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    return {
      col: Math.floor((x - ox) / cell),
      row: Math.floor((y - oy) / cell),
      px: x,
      py: y,
    };
  }

  onStageDown(e: PointerEvent): void {
    if (this.status !== 'playing') return;
    if (this.isMenuPanelOpen) return; // paused — the popup owns input
    const cell = this.pointerToCell(e);
    if (!cell) return;
    // Only the center-row marbles are handles — tapping one selects it (the
    // glow moves there), and it's the only row whose marbles can be shifted.
    if (cell.row === PITCH_ROW && cell.col >= 0 && cell.col < COLS) this.selectedCol = cell.col;
    this.drag = { active: true, pointerId: e.pointerId, col: cell.col, row: cell.row, startX: cell.px, startY: cell.py, dir: 0, hdir: 0 };
    // Capture the pointer so the move/up events keep firing even if the
    // finger/cursor drifts off the board mid-drag.
    try { (e.currentTarget as HTMLElement)?.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
  }

  onStageMove(e: PointerEvent): void {
    if (!this.drag.active || e.pointerId !== this.drag.pointerId) return;
    // Drags only work from the center row — only those marbles are handles.
    if (this.drag.col < 0 || this.drag.col >= COLS) return;
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { cell } = this.layout();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    const dx = x - this.drag.startX;
    const dy = y - this.drag.startY;
    const threshold = Math.max(10, cell * 0.35);
    // Horizontal drag along the pitch row shifts the whole row left/right;
    // a vertical drag from the pitch row shifts that column up/down.
    if (this.drag.row === PITCH_ROW) {
      if (Math.abs(dx) >= threshold) this.drag.hdir = dx < 0 ? -1 : 1;
      if (Math.abs(dy) >= threshold) this.drag.dir = dy < 0 ? -1 : 1;
    }
  }

  onStageUp(e: PointerEvent): void { this.finishDrag(e, true); }

  onStageCancel(e: PointerEvent): void { this.finishDrag(e, false); }

  private finishDrag(e: PointerEvent, commit: boolean): void {
    if (!this.drag.active || e.pointerId !== this.drag.pointerId) return;
    const d = this.drag;
    this.drag = { active: false, pointerId: -1, col: -1, row: -1, startX: 0, startY: 0, dir: 0, hdir: 0 };
    if (!commit || this.status !== 'playing') return;
    // Tap on the ◀ / ▶ arrows beside the pitch row → shift the row that way.
    if (d.row === PITCH_ROW && d.col === -1) { this.shiftRow(-1); return; }
    if (d.row === PITCH_ROW && d.col === COLS) { this.shiftRow(1); return; }
    const onBoard = d.col >= 0 && d.col < COLS;
    if (d.hdir !== 0 && onBoard) {
      // Horizontal drag along the center row → shift the whole row.
      this.shiftRow(d.hdir);
    } else if (d.dir !== 0 && onBoard) {
      // Drag up/down from the center row → shift that whole column.
      this.selectedCol = d.col;
      this.shiftColumn(d.dir);
    } else if (onBoard) {
      // A plain tap selects the marble under the pointer (already set on
      // pointer-down); shifting requires a drag from the center row.
      this.playClick();
    }
  }

  // ── Player 2 pointer controls (local 2P only) ──────────────────────────

  /** Map a pointer event on P2's (opponent) canvas to board grid coords. */
  private opponentPointerToCell(e: PointerEvent): { col: number; row: number; px: number; py: number } | null {
    const canvas = this.opponentCanvasRef?.nativeElement;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const { cell, ox, oy } = this.boardLayout(canvas.width, canvas.height);
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    return {
      col: Math.floor((x - ox) / cell),
      row: Math.floor((y - oy) / cell),
      px: x,
      py: y,
    };
  }

  onP2StageDown(e: PointerEvent): void {
    if (this.status !== 'playing' || !this.isLocal2P) return;
    if (this.isMenuPanelOpen) return;
    const cell = this.opponentPointerToCell(e);
    if (!cell) return;
    if (cell.row === PITCH_ROW && cell.col >= 0 && cell.col < COLS) this.p2SelectedCol = cell.col;
    this.p2Drag = { active: true, pointerId: e.pointerId, col: cell.col, row: cell.row, startX: cell.px, startY: cell.py, dir: 0, hdir: 0 };
    try { (e.currentTarget as HTMLElement)?.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
  }

  onP2StageMove(e: PointerEvent): void {
    if (!this.p2Drag.active || e.pointerId !== this.p2Drag.pointerId) return;
    if (this.p2Drag.col < 0 || this.p2Drag.col >= COLS) return;
    const canvas = this.opponentCanvasRef?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { cell } = this.boardLayout(canvas.width, canvas.height);
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    const dx = x - this.p2Drag.startX;
    const dy = y - this.p2Drag.startY;
    const threshold = Math.max(10, cell * 0.35);
    if (this.p2Drag.row === PITCH_ROW) {
      if (Math.abs(dx) >= threshold) this.p2Drag.hdir = dx < 0 ? -1 : 1;
      if (Math.abs(dy) >= threshold) this.p2Drag.dir = dy < 0 ? -1 : 1;
    }
  }

  onP2StageUp(e: PointerEvent): void { this.finishP2Drag(e, true); }

  onP2StageCancel(e: PointerEvent): void { this.finishP2Drag(e, false); }

  private finishP2Drag(e: PointerEvent, commit: boolean): void {
    if (!this.p2Drag.active || e.pointerId !== this.p2Drag.pointerId) return;
    const d = this.p2Drag;
    this.p2Drag = { active: false, pointerId: -1, col: -1, row: -1, startX: 0, startY: 0, dir: 0, hdir: 0 };
    if (!commit || this.status !== 'playing' || !this.isLocal2P) return;
    const onBoard = d.col >= 0 && d.col < COLS;
    if (d.hdir !== 0 && onBoard) {
      // Horizontal drag along P2's center row → rotate that row.
      this.shiftP2Row(d.hdir);
    } else if (d.dir !== 0 && onBoard) {
      // Drag up/down from P2's center row → shift that whole column.
      this.p2SelectedCol = d.col;
      this.shiftP2Column(d.dir);
    } else if (onBoard) {
      this.playClick();
    }
  }

  // ── Render loop ─────────────────────────────────────────────────────────

  private loop(t: number): void {
    if (this._destroyed) return;
    this.animId = requestAnimationFrame(x => this.loop(x));
    const dt = Math.min((t - this.lastTime) / 1000, 0.05);
    this.lastTime = t;
    if (this.status === 'splash') {
      // Slow roll so the splash marble's skin visibly spins.
      this.splashRoll += dt * 1.1;
      this.drawSplash();
    } else if (this.status === 'playing' || this.status === 'won') {
      // Paused (in-game menu open): freeze the animation — keep rendering the
      // last frame behind the popup but don't advance sprites, the opponent
      // jitter buffer or the shard bursts. The server has also paused, so no
      // new drops/AI moves arrive while the menu is open.
      if (!this.isMenuPanelOpen) this.update(dt);
      this.draw();
      this.drawOpponent();
    }
  }

  private update(dt: number): void {
    // Play back opponent snapshots once their jitter-buffer delay has elapsed,
    // so bursts of packets are spread over the buffer rather than applied all
    // at once. A stall drains the queue smoothly and then simply holds.
    const now = performance.now();
    while (this._oppQueue.length > 0 && now >= this._oppQueue[0].at + OPP_BUFFER_MS) {
      const item = this._oppQueue.shift()!;
      this.playOpponentUpdate(item.view);
    }
    this.sprites = this.advanceSprites(this.sprites, dt, this._shards);
    this._oppSprites = this.advanceSprites(this._oppSprites, dt, this._oppShards);
    this.advanceShards(this._shards, dt);
    this.advanceShards(this._oppShards, dt);
    // Age the blocked-shift nudges (P1 + local 2P P2); clear them once done.
    if (this.nudgeCol >= 0) {
      this.nudgeT += dt;
      if (this.nudgeT >= NUDGE_DUR) this.nudgeCol = -1;
    }
    if (this.p2NudgeCol >= 0) {
      this.p2NudgeT += dt;
      if (this.p2NudgeT >= NUDGE_DUR) this.p2NudgeCol = -1;
    }
    if (this._dumpBurstT > 0) this._dumpBurstT = Math.max(0, this._dumpBurstT - dt);
    if (this._oppDumpBurstT > 0) this._oppDumpBurstT = Math.max(0, this._oppDumpBurstT - dt);
  }

  /** Apply an opponent snapshot with its quiet sound echoes, kept in lockstep
   *  with the buffered playback so the audio matches the animation. */
  private playOpponentUpdate(opp: MarblesOpponentView): void {
    this.applyOpponentBoard(opp);
    if (opp.dropped) this.playDrop(true);
    if (opp.rained > 0) this.playRain(opp.rained, true);
    if ((opp.popped?.length ?? 0) > 0) this.playPop(opp.popped.length, true);
    if ((opp.reserveDump ?? 0) > 0) this.triggerOpponentDumpBurst();
  }

  /** Advance one sprite list toward its targets (shared by player + opponent).
   *  Timed sprites (moveDur > 0, the opponent) ease along the gap between
   *  updates; untimed sprites (the player) keep the legacy fixed-speed glide
   *  for instant input feedback. */
  private advanceSprites(sprites: Sprite[], dt: number, shards: PopShard[]): Sprite[] {
    for (const s of sprites) {
      if (s.phase === 'pop') {
        s.popT += dt;
        // Tremble for popDelay seconds, then shatter: fire the shard burst
        // once and shrink the marble away.
        if (!s.broken && s.popT >= s.popDelay) {
          s.broken = true;
          this.spawnPopBurst(s.col, s.row, s.color, shards);
        }
        // Hold at full size briefly after the burst fires, then shrink gently
        // over ~0.45 s so the marble visibly crumbles instead of vanishing.
        if (s.broken) {
          s._popHold = (s._popHold ?? 0) + dt;
          if (s._popHold > 0.08) s.scale -= dt * 2.2;
        }
        continue;
      }
      if (s.moveDur > 0) {
        this.advanceTimedSprite(s, dt);
        continue;
      }
      // Move toward target; roll while sliding. A marble rolls around the axis
      // perpendicular to its motion, so the spin direction matches travel.
      const dc = s.tCol - s.col;
      const dr = s.tRow - s.row;
      const dist = Math.hypot(dc, dr);
      if (dist > 0.01) {
        const dirSign = Math.abs(dc) >= Math.abs(dr) ? Math.sign(dc) : Math.sign(dr);
        // A pitch-row horizontal shift gets a distinct eased glide so the
        // slide is obvious, plus a subtle squash-stretch along the motion.
        const isRowSlide = Math.abs(dr) < 0.05 && Math.abs(s.row - PITCH_ROW) < 0.05 && Math.abs(dc) > 0.01;
        if (isRowSlide) {
          const step = Math.min(dist, Math.max(dist * 0.3, dt * 2.2));
          s.col += (dc / dist) * step;
          s.row += (dr / dist) * step;
          s.roll += dirSign * step * 2.2;
          s.stretch = 1 + Math.min(0.22, dist * 0.16);
        } else {
          const step = Math.min(dist, dt * 9);
          s.col += (dc / dist) * step;
          s.row += (dr / dist) * step;
          s.roll += dirSign * step * 2.2;
          s.stretch = 1;
        }
      } else {
        s.col = s.tCol;
        s.row = s.tRow;
        s.stretch = 1;
      }
    }
    return sprites.filter(s => !(s.phase === 'pop' && s.broken && s.scale <= 0.02));
  }

  /** Map each popped cell to a delay (seconds) before its shatter, grouping
   *  connected same-colour cells into runs and ordering each run along its
   *  dominant axis (left→right for horizontal, top→bottom for vertical) so a
   *  match breaks in sequence instead of all at once. */
  private popDelaysFor(popped: { row: number; col: number; color: number }[]): Map<string, number> {
    const delays = new Map<string, number>();
    const cells = new Map<string, { row: number; col: number; color: number }>();
    for (const p of popped) cells.set(`${p.row},${p.col}`, p);
    const visited = new Set<string>();
    const STAGGER = 0.11;
    for (const key of cells.keys()) {
      if (visited.has(key)) continue;
      const queue = [key];
      visited.add(key);
      const order: string[] = [];
      while (queue.length) {
        const k = queue.shift()!;
        order.push(k);
        const c = cells.get(k)!;
        const neighbours = [[c.row, c.col - 1], [c.row, c.col + 1], [c.row - 1, c.col], [c.row + 1, c.col]];
        for (const [nr, nc] of neighbours) {
          const nk = `${nr},${nc}`;
          const np = cells.get(nk);
          if (np && np.color === c.color && !visited.has(nk)) { visited.add(nk); queue.push(nk); }
        }
      }
      const first = cells.get(order[0])!;
      if (order.every(k => cells.get(k)!.row === first.row)) {
        order.sort((a, b) => cells.get(a)!.col - cells.get(b)!.col);
      } else if (order.every(k => cells.get(k)!.col === first.col)) {
        order.sort((a, b) => cells.get(a)!.row - cells.get(b)!.row);
      }
      order.forEach((k, i) => delays.set(k, i * STAGGER));
    }
    return delays;
  }

  /** Fire a marble's shatter: a white flash ring plus a spray of tinted
   *  fragments that fly outward and drop with gravity. */
  private spawnPopBurst(col: number, row: number, colorId: number, shards: PopShard[]): void {
    const base = COLORS[colorId] ?? COLORS[1];
    shards.push({
      col, row, vCol: 0, vRow: 0, life: 0.4, maxLife: 0.4, size: 0.12,
      color: [255, 255, 255], spin: 0, spinSpeed: 0, ring: true,
    });
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
      const speed = 0.9 + Math.random() * 1.6;
      const bright = 0.7 + Math.random() * 0.7;
      shards.push({
        col, row,
        vCol: Math.cos(a) * speed,
        vRow: Math.sin(a) * speed - 1.1,
        life: 0.7 + Math.random() * 0.5,
        maxLife: 1.2,
        size: 0.045 + Math.random() * 0.07,
        color: [clamp255(base[0] * bright), clamp255(base[1] * bright), clamp255(base[2] * bright)],
        spin: Math.random() * Math.PI * 2,
        spinSpeed: (Math.random() - 0.5) * 14,
        ring: false,
      });
    }
  }

  /** Step shard physics (fragments fly/fall, rings expand) and cull the dead. */
  private advanceShards(shards: PopShard[], dt: number): void {
    for (const s of shards) {
      s.life -= dt;
      if (s.ring) {
        s.size += dt * 1.5;
      } else {
        s.col += s.vCol * dt;
        s.row += s.vRow * dt;
        s.vRow += 9 * dt;
        s.spin += s.spinSpeed * dt;
      }
    }
    for (let i = shards.length - 1; i >= 0; i--) {
      if (shards[i].life <= 0) shards.splice(i, 1);
    }
  }

  /** Draw shatter shards + flash rings for one board (grid → px via layout). */
  private drawShards(ctx: CanvasRenderingContext2D, shards: PopShard[], cell: number, ox: number, oy: number): void {
    for (const s of shards) {
      const px = ox + (s.col + 0.5) * cell;
      const py = oy + (s.row + 0.5) * cell;
      const fade = Math.max(0, Math.min(1, s.life / s.maxLife));
      if (s.ring) {
        ctx.strokeStyle = `rgba(255,255,255,${(0.85 * fade).toFixed(3)})`;
        ctx.lineWidth = Math.max(1.5, cell * 0.09);
        ctx.beginPath();
        ctx.arc(px, py, s.size * cell, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(s.spin);
      ctx.globalAlpha = fade;
      ctx.fillStyle = `rgb(${s.color[0] | 0},${s.color[1] | 0},${s.color[2] | 0})`;
      const sz = Math.max(1.5, s.size * cell);
      ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
      ctx.restore();
    }
  }

  /** Start the reserve-dump celebration on the player's own board. */
  private triggerDumpBurst(): void {
    this._dumpBurstT = DUMP_BURST_DUR;
    this.playDumpBurst();
  }

  /** Start the (quieter) reserve-dump celebration on the opponent's board. */
  private triggerOpponentDumpBurst(): void {
    this._oppDumpBurstT = DUMP_BURST_DUR;
    this.playDumpBurst(true);
  }

  /** Gold flash, shockwave rings and a "RESERVE DUMP!" banner over the pitch
   *  row while `t` (remaining seconds) is positive. */
  private drawDumpBurst(ctx: CanvasRenderingContext2D, cell: number, ox: number, oy: number, t: number): void {
    if (t <= 0) return;
    const p = 1 - t / DUMP_BURST_DUR; // 0 → 1 over the burst
    const fade = 1 - p;               // 1 → 0
    const cx = ox + (COLS * cell) / 2;
    const cy = oy + (PITCH_ROW + 0.5) * cell;

    // Full-width gold flash across the match zone.
    const band = ctx.createLinearGradient(0, cy - cell * 2, 0, cy + cell * 2);
    band.addColorStop(0, 'rgba(255,235,150,0)');
    band.addColorStop(0.5, `rgba(255,245,190,${(0.5 * fade).toFixed(3)})`);
    band.addColorStop(1, 'rgba(255,235,150,0)');
    ctx.fillStyle = band;
    ctx.fillRect(ox - cell, cy - cell * 2, cell * (COLS + 2), cell * 4);

    // Three expanding shockwave rings.
    for (let i = 0; i < 3; i++) {
      const a = 0.55 * fade * (1 - i * 0.28);
      if (a <= 0.01) continue;
      ctx.strokeStyle = `rgba(255,214,80,${a.toFixed(3)})`;
      ctx.lineWidth = Math.max(2, cell * 0.08);
      ctx.beginPath();
      ctx.arc(cx, cy, cell * (0.5 + p * (2.4 + i * 0.7)), 0, Math.PI * 2);
      ctx.stroke();
    }

    // "RESERVE DUMP!" banner with a pop-in scale.
    const pop = 1 + 0.35 * Math.sin(Math.min(1, p * 2.2) * Math.PI);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(pop, pop);
    ctx.globalAlpha = Math.max(0, Math.min(1, fade * 1.5));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${Math.max(13, cell * 0.72)}px 'Segoe UI', sans-serif`;
    ctx.shadowColor = 'rgba(0,0,0,0.75)';
    ctx.shadowBlur = Math.max(4, cell * 0.2);
    ctx.fillStyle = '#fff3a0';
    ctx.fillText('RESERVE DUMP!', 0, 0);
    ctx.restore();
  }

  /** Time-based eased interpolation for a sprite toward its target. Uses the
   *  stored start position + clock so retargeting mid-move (a new update
   *  arriving early) just steers from the current spot — no snapping, no
   *  stutter under jitter. */
  private advanceTimedSprite(s: Sprite, dt: number): void {
    s.moveT = Math.min(1, s.moveT + (dt * 1000) / s.moveDur);
    const e = easeOutCubic(s.moveT);
    const prevCol = s.col;
    const prevRow = s.row;
    s.col = s.fromCol + (s.tCol - s.fromCol) * e;
    s.row = s.fromRow + (s.tRow - s.fromRow) * e;

    const dc = s.col - prevCol;
    const dr = s.row - prevRow;
    const moved = Math.hypot(dc, dr);
    if (moved > 0) {
      const dirSign = Math.abs(dc) >= Math.abs(dr) ? Math.sign(dc) : Math.sign(dr);
      s.roll += dirSign * moved * 2.2;
    }

    const isRowSlide = Math.abs(s.tRow - s.fromRow) < 0.05
      && Math.abs(s.fromRow - PITCH_ROW) < 0.05
      && Math.abs(s.tCol - s.fromCol) > 0.01;
    if (isRowSlide) {
      const remaining = Math.abs(s.tCol - s.col);
      s.stretch = 1 + Math.min(0.22, remaining * 0.16);
    } else {
      s.stretch = 1;
    }

    if (s.moveT >= 1) {
      s.col = s.tCol;
      s.row = s.tRow;
      s.stretch = 1;
    }
  }

  private boardLayout(w: number, h: number): { cell: number; ox: number; oy: number } {
    const availW = w * 0.86, availH = h * 0.88;
    const cell = Math.min(availW / COLS, availH / ROWS);
    const ox = (w - cell * COLS) / 2;
    const oy = (h - cell * ROWS) / 2;
    return { cell, ox, oy };
  }

  private layout(): { cell: number; ox: number; oy: number } {
    const canvas = this.canvasRef?.nativeElement;
    const w = canvas?.width ?? 300, h = canvas?.height ?? 400;
    return this.boardLayout(w, h);
  }

  private draw(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !this.ctx) return;
    // Keep the backing store in sync with the CSS box every frame. The player
    // slot shrinks to half width when the opponent's board appears (flex row),
    // but resizeCanvas only runs on window resize — without this, the wider
    // buffer gets stretched into the narrower box and the marbles look
    // squished. Mirroring drawOpponent's per-frame sync fixes it.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const ch = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    const { cell, ox, oy } = this.layout();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    this.drawBoardBackdrop(ctx, canvas.width, canvas.height);
    this.drawTrench(ctx, cell, ox, oy);
    this.drawForegroundDecor(ctx, canvas.width, canvas.height, cell, ox, oy, this.boardMap);

    // Pitch row highlight (the center row / match zone).
    const oneAway = this.status === 'playing' && this.pitchOneAway();
    this.drawPitchHighlight(ctx, cell, ox, oy, oneAway);
    // Row arrows on the pitch line edges (interactive board only).
    const py = oy + (PITCH_ROW + 0.5) * cell;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `bold ${Math.max(12, cell * 0.5)}px 'Segoe UI', sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('◀', ox - cell * 0.6, py + cell * 0.18);
    ctx.fillText('▶', ox + cell * COLS + cell * 0.6, py + cell * 0.18);

    // Selection glow: a soft halo behind the selected center-row marble, so
    // the handle you're about to shift is obvious on both desktop and mobile.
    if (this.status === 'playing') {
      const pulse = this.pulsePhase();
      const gx = ox + (this.selectedCol + 0.5) * cell;
      const gy = oy + (PITCH_ROW + 0.5) * cell;
      const gr = cell * (1.15 + pulse * 0.35);
      const halo = ctx.createRadialGradient(gx, gy, cell * 0.28, gx, gy, gr);
      halo.addColorStop(0, `rgba(255,228,130,${(0.4 + pulse * 0.28).toFixed(3)})`);
      halo.addColorStop(0.55, `rgba(255,196,60,${(0.2 + pulse * 0.14).toFixed(3)})`);
      halo.addColorStop(1, 'rgba(255,196,60,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
    }

    // Marbles (a blocked column shift wiggles its marbles vertically).
    const nudgeOffset = this.nudgeCol >= 0 ? this.nudgeOffset() : 0;
    const sorted = [...this.sprites].sort((a, b) => a.row - b.row);
    for (const s of sorted) {
      // Tremble in place while a pop is counting down to its shatter.
      const tremble = s.phase === 'pop' && !s.broken ? Math.sin(s.popT * 70) * cell * 0.05 : 0;
      const px = ox + (s.col + 0.5) * cell + tremble;
      const py2 = oy + (s.row + 0.5) * cell + Math.cos(s.popT * 83) * cell * 0.04
        + (Math.round(s.col) === this.nudgeCol ? nudgeOffset * cell : 0);
      const radius = cell * 0.44 * Math.max(0, s.scale);
      if (radius <= 0) continue;
      const stretch = s.stretch ?? 1;
      if (stretch !== 1) {
        ctx.save();
        ctx.translate(px, py2);
        ctx.scale(stretch, 1 / stretch);
        this.drawMarble(ctx, 0, 0, radius, s.color, s.roll, s.id);
        ctx.restore();
      } else {
        this.drawMarble(ctx, px, py2, radius, s.color, s.roll, s.id);
      }
    }
    this.drawShards(ctx, this._shards, cell, ox, oy);
    this.drawDumpBurst(ctx, cell, ox, oy, this._dumpBurstT);

    // Selected column marker (for ↑/↓ shifts).
    if (this.status === 'playing') {
      const sx = ox + (this.selectedCol + 0.5) * cell;
      // Pulsing ring hugging the selected center-row marble.
      const pulse = this.pulsePhase();
      const sy = oy + (PITCH_ROW + 0.5) * cell;
      ctx.strokeStyle = `rgba(255,238,160,${(0.8 + pulse * 0.2).toFixed(3)})`;
      ctx.lineWidth = Math.max(2, cell * 0.1);
      ctx.beginPath();
      ctx.arc(sx, sy, cell * (0.62 + pulse * 0.1), 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = Math.max(1.5, cell * 0.05);
      ctx.beginPath();
      ctx.arc(sx, sy, cell * (0.68 + pulse * 0.1), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.moveTo(sx - cell * 0.28, oy - cell * 1.15);
      ctx.lineTo(sx + cell * 0.28, oy - cell * 1.15);
      ctx.lineTo(sx, oy - cell * 1.45);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.moveTo(sx - cell * 0.28, oy + cell * ROWS + cell * 0.9);
      ctx.lineTo(sx + cell * 0.28, oy + cell * ROWS + cell * 0.9);
      ctx.lineTo(sx, oy + cell * ROWS + cell * 0.6);
      ctx.closePath();
      ctx.fill();
    }

    // Vertical-drag indicator: an amber arrow above/below the dragged column
    // shows which way the column is about to shift.
    if (this.drag.active && this.drag.dir !== 0 && this.drag.col >= 0 && this.drag.col < COLS) {
      const dx = ox + (this.drag.col + 0.5) * cell;
      ctx.fillStyle = 'rgba(255,214,0,0.9)';
      ctx.beginPath();
      if (this.drag.dir < 0) {
        ctx.moveTo(dx - cell * 0.3, oy - cell * 0.95);
        ctx.lineTo(dx + cell * 0.3, oy - cell * 0.95);
        ctx.lineTo(dx, oy - cell * 1.3);
      } else {
        ctx.moveTo(dx - cell * 0.3, oy + cell * ROWS + cell * 0.55);
        ctx.lineTo(dx + cell * 0.3, oy + cell * ROWS + cell * 0.55);
        ctx.lineTo(dx, oy + cell * ROWS + cell * 0.9);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawPitchHighlight(ctx: CanvasRenderingContext2D, cell: number, ox: number, oy: number, oneAway = false): void {
    // Two carved guide lines above and below the centre (pitch) row, like the
    // original game — this is the only row whose marbles slide sideways. The
    // gap between the lines carries a soft vertical highlight so the active
    // row reads at a glance, and it glows when a single slide would form a
    // match ("one slide away").
    const overhang = cell * 0.6;
    const yTop = oy + PITCH_ROW * cell;
    const yBot = oy + (PITCH_ROW + 1) * cell;
    const bandH = yBot - yTop;

    // Vertical gap highlight across the pitch-row band.
    const band = ctx.createLinearGradient(0, yTop, 0, yBot);
    if (oneAway) {
      const pulse = this.pulsePhase();
      band.addColorStop(0, 'rgba(255,230,140,0)');
      band.addColorStop(0.5, `rgba(255,230,140,${(0.32 + pulse * 0.3).toFixed(3)})`);
      band.addColorStop(1, 'rgba(255,230,140,0)');
    } else {
      band.addColorStop(0, 'rgba(255,240,190,0)');
      band.addColorStop(0.5, 'rgba(255,240,190,0.09)');
      band.addColorStop(1, 'rgba(255,240,190,0)');
    }
    ctx.fillStyle = band;
    ctx.fillRect(ox - overhang, yTop, cell * COLS + overhang * 2, bandH);

    ctx.lineCap = 'round';
    // A line drawn in the sand reads as a groove darker than the trench floor,
    // so tint both guide lines from the map's darkest pit colour rather than
    // the old flat yellow highlight.
    const hole = hexToRgb(this.boardMap.pit[2]);
    for (const y of [yTop, yBot]) {
      // Dark carved groove (shadow).
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = Math.max(2.5, cell * 0.15);
      ctx.beginPath();
      ctx.moveTo(ox - overhang, y);
      ctx.lineTo(ox + cell * COLS + overhang, y);
      ctx.stroke();
      // Carved edge above the groove — darker than the surrounding pit, and it
      // lightens (staying sandy) when a single slide would form a match.
      ctx.strokeStyle = oneAway ? lighten(hole, 0.35) : darken(hole, 0.28);
      ctx.lineWidth = Math.max(1.5, cell * (oneAway ? 0.13 : 0.09));
      ctx.beginPath();
      ctx.moveTo(ox - overhang, y - Math.max(1, cell * 0.07));
      ctx.lineTo(ox + cell * COLS + overhang, y - Math.max(1, cell * 0.07));
      ctx.stroke();
    }
  }

  /** True if a single legal slide (row ±1 or any column ±1) would form a
   *  3+ same-color run in the pitch row — the "one slide away" glow trigger. */
  /** True if a single move on P2's board (local 2P) would form a match —
   *  same logic as pitchOneAway but evaluated on the opponent board. */
  private pitchOneAwayOn(board: number[][] | null): boolean {
    if (!board || board.length !== ROWS) return false;
    const pitch = board[PITCH_ROW];
    if (!pitch || pitch.length !== COLS) return false;

    // Row shifts permute the pitch row.
    for (const dir of [-1, 1]) {
      const row = new Array<number>(COLS);
      for (let c = 0; c < COLS; c++) row[c] = pitch[(c - dir + COLS) % COLS];
      if (pitchHasRun(row)) return true;
    }

    // Column shifts change only the pitch-row cell of that column.
    for (let c = 0; c < COLS; c++) {
      for (const dir of [-1, 1]) {
        const row = pitch.slice();
        row[c] = board[(PITCH_ROW - dir + ROWS) % ROWS][c];
        if (pitchHasRun(row)) return true;
      }
    }
    return false;
  }

  private pitchOneAway(): boolean {
    return this.pitchOneAwayOn(this._board);
  }

  /** Render the opponent's live board with the same sprite animations the
   *  player's side uses (slides, pops, falls). */
  private drawOpponent(): void {
    const canvas = this.opponentCanvasRef?.nativeElement;
    if (!canvas) return;

    // Keep the backing store in sync with the CSS box (slot appears mid-game).
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const ch = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const { cell, ox, oy } = this.boardLayout(canvas.width, canvas.height);
    this.drawBoardBackdrop(ctx, canvas.width, canvas.height);
    this.drawTrench(ctx, cell, ox, oy);
    this.drawForegroundDecor(ctx, canvas.width, canvas.height, cell, ox, oy, this.boardMap);
    // Local 2P: P2's board is live, so highlight a one-slide-away match on it
    // too; a plain AI opponent never gets the glow.
    const oneAway = this.isLocal2P && this.status === 'playing' && this.pitchOneAwayOn(this._oppBoard);
    this.drawPitchHighlight(ctx, cell, ox, oy, oneAway);

    // Local 2P: P2's selection glow (a blue halo, distinct from P1's gold) so
    // the handle W/S will shift is obvious on the opponent board too.
    if (this.isLocal2P && this.status === 'playing') {
      const pulse = this.pulsePhase();
      const gx = ox + (this.p2SelectedCol + 0.5) * cell;
      const gy = oy + (PITCH_ROW + 0.5) * cell;
      const gr = cell * (1.15 + pulse * 0.35);
      const halo = ctx.createRadialGradient(gx, gy, cell * 0.28, gx, gy, gr);
      halo.addColorStop(0, `rgba(120,220,255,${(0.4 + pulse * 0.28).toFixed(3)})`);
      halo.addColorStop(0.55, `rgba(80,180,255,${(0.2 + pulse * 0.14).toFixed(3)})`);
      halo.addColorStop(1, 'rgba(80,180,255,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
    }

    // Animated marbles — same pipeline as the player's board.
    const sorted = [...this._oppSprites].sort((a, b) => a.row - b.row);
    const hotColor = this.opponent?.specialColor ?? 0;
    const p2NudgeOffset = this.isLocal2P ? this.p2NudgeOffset() : 0;
    for (const s of sorted) {
      const tremble = s.phase === 'pop' && !s.broken ? Math.sin(s.popT * 70) * cell * 0.05 : 0;
      const px = ox + (s.col + 0.5) * cell + tremble;
      const py = oy + (s.row + 0.5) * cell + Math.cos(s.popT * 83) * cell * 0.04
        + (Math.round(s.col) === this.p2NudgeCol ? p2NudgeOffset * cell : 0);
      const radius = cell * 0.44 * Math.max(0, s.scale);
      if (radius <= 0) continue;
      const stretch = s.stretch ?? 1;
      // s.id + per-match offset keeps each marble's look stable as it moves,
      // while re-rolling the whole board's skins every game.
      if (stretch !== 1) {
        ctx.save();
        ctx.translate(px, py);
        ctx.scale(stretch, 1 / stretch);
        this.drawMarble(ctx, 0, 0, radius, s.color, s.roll, s.id + this.opponentSeedOffset, hotColor);
        ctx.restore();
      } else {
        this.drawMarble(ctx, px, py, radius, s.color, s.roll, s.id + this.opponentSeedOffset, hotColor);
      }
    }
    this.drawShards(ctx, this._oppShards, cell, ox, oy);
    this.drawDumpBurst(ctx, cell, ox, oy, this._oppDumpBurstT);
  }

  private drawBoardBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    // Full-bleed arena floor — the board sits on the selected map's ground.
    const map = this.boardMap;
    const ground = ctx.createLinearGradient(0, 0, 0, h);
    ground.addColorStop(0, map.bg[0]);
    ground.addColorStop(0.5, map.bg[1]);
    ground.addColorStop(1, map.bg[2]);
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, w, h);

    // Ground speckle for texture — varied grain, not uniform dots.
    ctx.fillStyle = map.darkSpeckle;
    for (let i = 0; i < 68; i++) {
      const x = (i * 97.3) % w;
      const y = (i * 53.7) % h + Math.sin(i * 0.7) * 4;
      ctx.beginPath();
      ctx.ellipse(x, y, 1.6 + (i % 3) * 0.9, 1.1 + (i % 2) * 0.6, (i % 4) * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = map.lightSpeckle;
    for (let i = 0; i < 46; i++) {
      const x = (i * 83.1) % w;
      const y = (i * 47.9) % h + Math.cos(i * 0.9) * 3;
      ctx.beginPath();
      ctx.arc(x, y, 0.9 + (i % 2) * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    // Horizon haze — a soft warm wash near the mid-sky makes the ground feel sun-lit and deep.
    const haze = ctx.createLinearGradient(0, h * 0.22, 0, h * 0.55);
    haze.addColorStop(0, 'rgba(255,255,255,0)');
    haze.addColorStop(0.5, 'rgba(255,250,230,0.14)');
    haze.addColorStop(1, 'rgba(255,250,230,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, h * 0.22, w, h * 0.33);
    // Subtle vignette — darker edges so the pit pops and the scene feels like a photo.
    const vign = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.4, w * 0.5, h * 0.5, Math.max(w, h) * 0.9);
    vign.addColorStop(0, 'rgba(0,0,0,0)');
    vign.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = vign;
    ctx.fillRect(0, 0, w, h);

    this.drawBackdropDecor(ctx, w, h, map);
  }

  /** Ambient scenery for the arena: stars, waves, clouds, snow, neon grid,
   *  lava cracks, cacti. Positions are deterministic per canvas size so the
   *  scene never flickers; only the star twinkle animates. */
  private drawBackdropDecor(ctx: CanvasRenderingContext2D, w: number, h: number, map: BoardMapTheme): void {
    const t = performance.now();
    switch (map.decor) {
      case 'playground': {
        // — Lifelike sunny playground: blue sky wash at top fading into haze, warm sun with halo, soft distant treeline and fence haze so the sand feels outdoors.
        const sky = ctx.createLinearGradient(0, 0, 0, h * 0.48);
        sky.addColorStop(0, 'rgba(135,200,235,0.55)');
        sky.addColorStop(0.5, 'rgba(200,230,250,0.28)');
        sky.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h * 0.52);
        // Sun — soft halo top-right
        const sx = w * 0.82, sy = h * 0.14, sr = Math.min(w, h) * 0.09;
        const sun = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 2.2);
        sun.addColorStop(0, 'rgba(255,248,180,0.95)');
        sun.addColorStop(0.35, 'rgba(255,236,120,0.45)');
        sun.addColorStop(1, 'rgba(255,236,120,0)');
        ctx.fillStyle = sun;
        ctx.beginPath(); ctx.arc(sx, sy, sr * 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,252,220,0.98)';
        ctx.beginPath(); ctx.arc(sx, sy, sr * 0.55, 0, Math.PI * 2); ctx.fill();
        // Fluffy cartoon clouds with soft shadow — three clumps drifting
        ctx.fillStyle = 'rgba(255,255,255,0.72)';
        for (let i = 0; i < 4; i++) {
          const cx = w * (0.18 + (i % 3) * 0.27) + Math.sin(t * 0.0004 + i) * w * 0.015;
          const cy = h * (0.10 + (i % 2) * 0.09);
          const R = Math.min(w, h) * (0.045 + (i % 3) * 0.01);
          // shadow under
          ctx.fillStyle = 'rgba(80,110,140,0.12)';
          ctx.beginPath(); ctx.ellipse(cx + R * 0.18, cy + R * 0.28, R * 1.25, R * 0.45, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.78)';
          ctx.beginPath();
          ctx.ellipse(cx, cy, R * 1.1, R * 0.62, 0, 0, Math.PI * 2);
          ctx.ellipse(cx + R * 0.55, cy - R * 0.08, R * 0.72, R * 0.58, 0, 0, Math.PI * 2);
          ctx.ellipse(cx - R * 0.5, cy - R * 0.05, R * 0.62, R * 0.52, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        // Distant soft treeline / fence haze at horizon — gives playground depth
        ctx.fillStyle = 'rgba(70,120,70,0.22)';
        ctx.beginPath();
        ctx.moveTo(0, h * 0.42);
        for (let x = 0; x <= w; x += w / 12) {
          const hump = Math.sin(x * 0.018 + 1) * h * 0.02 + Math.cos(x * 0.009) * h * 0.012;
          ctx.lineTo(x, h * 0.42 - hump + (x % (w/5) < w/10 ? h * 0.015 : 0));
        }
        ctx.lineTo(w, h * 0.42); ctx.lineTo(w, h * 0.48); ctx.lineTo(0, h * 0.48); ctx.closePath(); ctx.fill();
        // Fence posts haze
        ctx.fillStyle = 'rgba(160,120,70,0.20)';
        for (let i = 0; i < 10; i++) {
          const fx = (i + 0.5) * w / 10;
          ctx.fillRect(fx - 1, h * 0.40, 2, h * 0.045);
        }
        ctx.strokeStyle = 'rgba(150,110,60,0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, h * 0.415); ctx.lineTo(w, h * 0.415); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, h * 0.435); ctx.lineTo(w, h * 0.435); ctx.stroke();
        // Wind-combed sand ripples — finer, more organic spacing and wobble
        ctx.strokeStyle = 'rgba(130,95,45,0.18)';
        ctx.lineWidth = Math.max(1, h * 0.005);
        for (let i = 0; i < 8; i++) {
          const y = h * 0.52 + (i * 31.7) % (h * 0.48);
          const wob = Math.sin(i * 1.9) * h * 0.012;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.bezierCurveTo(w * 0.22, y - h * 0.012 + wob, w * 0.62, y + h * 0.014 + wob, w, y);
          ctx.stroke();
        }
        // Footprints — now with soft inner shadow / depth rim
        for (let i = 0; i < 8; i++) {
          const fx = (i * 173.3) % w;
          const fy = h * 0.52 + (i * 97.7) % (h * 0.46);
          // soft shadow
          ctx.fillStyle = 'rgba(90,60,20,0.18)';
          ctx.beginPath(); ctx.ellipse(fx, fy + 1.8, 5.5, 2.2, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(150,110,55,0.30)';
          ctx.beginPath();
          ctx.ellipse(fx - 4, fy, 3.2, 4.6, 0.4, 0, Math.PI * 2);
          ctx.ellipse(fx + 4, fy, 3.2, 4.6, -0.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(120,80,35,0.20)';
          ctx.beginPath();
          ctx.ellipse(fx - 4, fy + 0.8, 1.8, 1.2, 0.4, 0, Math.PI * 2);
          ctx.ellipse(fx + 4, fy + 0.8, 1.8, 1.2, -0.3, 0, Math.PI * 2);
          ctx.fill();
        }
        // Pebbles — now with cast shadow and highlight so they sit in sand, not float
        for (let i = 0; i < 16; i++) {
          const x = (i * 61.7) % w;
          const y = h * 0.54 + (i * 43.9) % (h * 0.42);
          // shadow
          ctx.fillStyle = 'rgba(70,45,20,0.22)';
          ctx.beginPath(); ctx.ellipse(x + 1.2, y + 1.6, 3.2 + (i % 3) * 0.5, 1.6, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(110,80,40,0.52)';
          ctx.beginPath();
          ctx.ellipse(x, y, 3 + (i % 3), 2 + (i % 2), 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,240,210,0.38)';
          ctx.beginPath(); ctx.arc(x - 0.9, y - 0.6, 0.9, 0, Math.PI * 2); ctx.fill();
        }
        // Fine sand sparkle — warm glints catching the sun
        ctx.fillStyle = 'rgba(255,245,210,0.55)';
        for (let i = 0; i < 14; i++) {
          const x = (i * 89.3) % w;
          const y = h * 0.54 + (i * 57.1) % (h * 0.44);
          const glint = 0.6 + 0.5 * Math.sin(t * 0.002 + i * 1.3);
          ctx.globalAlpha = glint;
          ctx.beginPath(); ctx.arc(x, y, 1.1 + (i % 2) * 0.6, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        return;
      }
      case 'stars': {
        // Lifelike Rocket Park — daytime, not galaxy night. Warm sunset sky behind a real rocket jungle-gym, crater mounds are soft play hills.
        const glow = ctx.createRadialGradient(w * 0.78, h * 0.18, 0, w * 0.78, h * 0.18, Math.min(w, h) * 0.42);
        glow.addColorStop(0, 'rgba(255,236,140,0.42)');
        glow.addColorStop(0.35, 'rgba(255,210,120,0.18)');
        glow.addColorStop(1, 'rgba(255,210,120,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h * 0.55);
        // Distant soft crater mounds — warm beige play hills, not sharp cones
        ctx.fillStyle = 'rgba(190,165,120,0.22)';
        ctx.beginPath();
        ctx.moveTo(0, h * 0.44);
        for (let x = 0; x <= w; x += w / 10) {
          const hump = Math.sin(x * 0.011 + 0.8) * h * 0.025 + Math.cos(x * 0.006) * h * 0.018;
          const crater = (x % (w / 3) < w / 12 ? -h * 0.012 : 0);
          ctx.lineTo(x, h * 0.44 - hump + crater);
        }
        ctx.lineTo(w, h * 0.44); ctx.lineTo(w, h * 0.50); ctx.lineTo(0, h * 0.50); ctx.closePath(); ctx.fill();
        // Bunting string lights across top — lifelike playground detail
        ctx.strokeStyle = 'rgba(80,60,40,0.22)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(0, h * 0.28);
        ctx.quadraticCurveTo(w * 0.25, h * 0.31, w * 0.5, h * 0.28);
        ctx.quadraticCurveTo(w * 0.75, h * 0.25, w, h * 0.28);
        ctx.stroke();
        for (let i = 0; i < 9; i++) {
          const fx = (i + 0.5) * w / 9;
          const fy = h * 0.285 + Math.sin((i % 9) * 0.9) * h * 0.012;
          const col = ['255,110,110', '255,220,90', '110,200,255', '120,220,120'][i % 4];
          ctx.fillStyle = `rgba(${col},0.88)`;
          ctx.beginPath();
          // pennant triangle
          ctx.moveTo(fx, fy);
          ctx.lineTo(fx - 6, fy + 10);
          ctx.lineTo(fx + 6, fy + 10);
          ctx.closePath(); ctx.fill();
        }
        // Soft fluffy clouds — real overcast, not twinkling stars
        for (let i = 0; i < 4; i++) {
          const cx = w * (0.15 + i * 0.22) + Math.sin(t * 0.00022 + i) * w * 0.01;
          const cy = h * (0.12 + (i % 2) * 0.04);
          const R = Math.min(w, h) * (0.042 + (i % 2) * 0.01);
          ctx.fillStyle = 'rgba(0,0,0,0.07)';
          ctx.beginPath(); ctx.ellipse(cx + R * 0.15, cy + R * 0.22, R * 1.15, R * 0.42, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.78)';
          ctx.beginPath();
          ctx.ellipse(cx, cy, R * 1.05, R * 0.58, 0, 0, Math.PI * 2);
          ctx.ellipse(cx + R * 0.5, cy - R * 0.06, R * 0.68, R * 0.5, 0, 0, Math.PI * 2);
          ctx.ellipse(cx - R * 0.48, cy - R * 0.04, R * 0.62, R * 0.48, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        // Subtle warm speckles on sand — not stars, just sun flecks through netting
        ctx.fillStyle = 'rgba(255,235,160,0.22)';
        for (let i = 0; i < 8; i++) {
          const x = (i * 137.7) % w;
          const y = h * 0.62 + (i * 41.3) % (h * 0.34);
          const glint = 0.5 + 0.5 * Math.sin(t * 0.0012 + i);
          ctx.globalAlpha = glint * 0.6;
          ctx.beginPath(); ctx.arc(x, y, 1.2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        return;
      }
      case 'waves': {
        // Sun high on the horizon.
        const sun = ctx.createRadialGradient(w * 0.85, h * 0.1, 0, w * 0.85, h * 0.1, Math.min(w, h) * 0.24);
        sun.addColorStop(0, 'rgba(255,252,220,0.95)');
        sun.addColorStop(0.3, 'rgba(255,244,180,0.4)');
        sun.addColorStop(1, 'rgba(255,244,180,0)');
        ctx.fillStyle = sun;
        ctx.fillRect(0, 0, w, h);
        // Lazy wave crests.
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = Math.max(1.5, h * 0.008);
        for (let band = 0; band < 3; band++) {
          const y0 = h * (0.74 + band * 0.1);
          for (let i = 0; i < 5; i++) {
            const x = (i * w) / 5 + (band % 2) * (w / 10);
            ctx.beginPath();
            ctx.arc(x, y0, h * 0.045, Math.PI, 0);
            ctx.stroke();
          }
        }
        // Seagulls circling.
        ctx.strokeStyle = 'rgba(50,50,55,0.8)';
        ctx.lineWidth = Math.max(1.5, h * 0.006);
        for (let i = 0; i < 3; i++) {
          const gx = w * (0.12 + 0.76 * ((t / 6000 + i * 0.33) % 1));
          const gy = h * (0.12 + i * 0.06) + Math.sin(t / 800 + i * 2) * h * 0.02;
          const s = Math.max(4, h * 0.02);
          ctx.beginPath();
          ctx.moveTo(gx - s, gy);
          ctx.quadraticCurveTo(gx - s * 0.5, gy - s * 0.7, gx, gy);
          ctx.quadraticCurveTo(gx + s * 0.5, gy - s * 0.7, gx + s, gy);
          ctx.stroke();
        }
        return;
      }
      case 'clouds': {
        // Sunny wash + drifting clouds.
        const sun = ctx.createRadialGradient(w * 0.85, h * 0.12, 0, w * 0.85, h * 0.12, Math.min(w, h) * 0.22);
        sun.addColorStop(0, 'rgba(255,250,200,0.9)');
        sun.addColorStop(0.35, 'rgba(255,240,150,0.35)');
        sun.addColorStop(1, 'rgba(255,240,150,0)');
        ctx.fillStyle = sun;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        for (let i = 0; i < 5; i++) {
          const x = (i * 211.7 + t * 0.006 * (1 + (i % 3))) % (w + 120) - 60;
          const y = 14 + ((i * 97.3) % (h * 0.3));
          const r = Math.min(w, h) * (0.05 + (i % 3) * 0.012);
          ctx.beginPath();
          ctx.ellipse(x, y, r * 1.8, r * 0.75, 0, 0, Math.PI * 2);
          ctx.ellipse(x + r, y - r * 0.2, r * 1.1, r * 0.65, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        // Birds.
        ctx.strokeStyle = 'rgba(50,50,55,0.75)';
        ctx.lineWidth = Math.max(1.5, h * 0.006);
        for (let i = 0; i < 3; i++) {
          const bx = w * (0.15 + 0.7 * ((t / 5000 + i * 0.35) % 1));
          const by = h * 0.16 + i * 16 + Math.sin(t / 700 + i * 1.5) * h * 0.015;
          const s = Math.max(4, h * 0.018);
          ctx.beginPath();
          ctx.moveTo(bx - s, by);
          ctx.quadraticCurveTo(bx - s * 0.5, by - s * 0.7, bx, by);
          ctx.quadraticCurveTo(bx + s * 0.5, by - s * 0.7, bx + s, by);
          ctx.stroke();
        }
        return;
      }
      case 'snow': {
        // Gentle falling snow.
        for (let i = 0; i < 90; i++) {
          const cyc = ((t * (0.008 + (i % 5) * 0.002) + i * 0.13) % 1);
          const x = ((i * 129.7 + Math.sin(t / 2000 + i) * 26) % w + w) % w;
          const y = (cyc * h + h) % h;
          const r = 0.8 + (i % 4) * 0.6;
          ctx.fillStyle = `rgba(255,255,255,${(0.5 + 0.3 * Math.sin(t / 700 + i * 2)).toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
        return;
      }
      case 'neon': {
        // Lifelike Glow Play Center — indoor soft-play under warm skylight, not synthwave grid.
        // Skylight panel top — creamy daylight
        const sky = ctx.createLinearGradient(0, 0, 0, h * 0.46);
        sky.addColorStop(0, 'rgba(255,250,240,0.95)');
        sky.addColorStop(1, 'rgba(255,240,225,0.22)');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h * 0.48);
        // Skylight grid beams — thin warm wood
        ctx.strokeStyle = 'rgba(160,120,80,0.18)';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(w * 0.33, 0); ctx.lineTo(w * 0.33, h * 0.46); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w * 0.66, 0); ctx.lineTo(w * 0.66, h * 0.46); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, h * 0.22); ctx.lineTo(w, h * 0.22); ctx.stroke();
        // Wall wainscot — pastel mint band at horizon so walls feel padded, not neon lines
        ctx.fillStyle = 'rgba(180,230,220,0.28)';
        ctx.fillRect(0, h * 0.40, w, h * 0.08);
        ctx.fillStyle = 'rgba(255,220,235,0.22)';
        ctx.fillRect(0, h * 0.385, w, 6);
        // Hanging paper lanterns / bunting — lifelike kid party decor, softly glowing
        for (let i = 0; i < 8; i++) {
          const lx = (i + 0.5) * w / 8 + Math.sin(t * 0.0003 + i) * 3;
          const ly = h * 0.20 + Math.cos(i * 0.7) * h * 0.02;
          const col = [i % 3 === 0 ? '255,180,200' : i % 3 === 1 ? '180,220,255' : '255,230,140'][0];
          // string
          ctx.strokeStyle = 'rgba(120,100,80,0.18)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(lx, h * 0.14); ctx.lineTo(lx, ly); ctx.stroke();
          // lantern glow
          const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, 10);
          glow.addColorStop(0, `rgba(${col},0.45)`);
          glow.addColorStop(1, `rgba(${col},0)`);
          ctx.fillStyle = glow;
          ctx.beginPath(); ctx.arc(lx, ly, 10, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = `rgba(${col},0.92)`;
          ctx.beginPath(); ctx.arc(lx, ly, 3.2, 0, Math.PI * 2); ctx.fill();
        }
        // Foam mat speckles on floor — subtle, not glowing dots
        ctx.fillStyle = 'rgba(80,60,90,0.08)';
        for (let i = 0; i < 18; i++) {
          const x = (i * 71.3) % w;
          const y = h * 0.62 + (i * 29.7) % (h * 0.34);
          ctx.beginPath(); ctx.arc(x, y, 1.4 + (i % 3) * 0.5, 0, Math.PI * 2); ctx.fill();
        }
        return;
      }
      case 'lava': {
        // Lifelike Volcano Splash Pad — terra-cotta ground with cool mist and turquoise water jets, not lava.
        // Misting nozzles line — thin silver posts with spray arcs
        ctx.strokeStyle = 'rgba(120,90,60,0.22)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          const mx = (i + 0.5) * w / 6;
          const my = h * 0.62 + Math.sin(i * 1.1) * h * 0.02;
          // post
          ctx.fillStyle = 'rgba(160,160,165,0.95)';
          ctx.fillRect(mx - 2, my - 8, 4, 12);
          ctx.fillStyle = 'rgba(90,90,95,0.95)';
          ctx.beginPath(); ctx.arc(mx, my - 10, 4, 0, Math.PI * 2); ctx.fill();
          // spray arc — light turquoise mist
          ctx.strokeStyle = 'rgba(110,200,230,0.42)';
          ctx.lineWidth = 2.2;
          const spraySway = Math.sin(t * 0.001 + i) * 4;
          ctx.beginPath();
          ctx.moveTo(mx, my - 14);
          ctx.quadraticCurveTo(mx + spraySway, my - h * 0.12, mx + spraySway * 1.4, my - h * 0.18);
          ctx.stroke();
          // mist puff at top
          const mist = ctx.createRadialGradient(mx + spraySway * 1.4, my - h * 0.18, 0, mx + spraySway * 1.4, my - h * 0.18, 14);
          mist.addColorStop(0, 'rgba(200,240,255,0.42)');
          mist.addColorStop(1, 'rgba(200,240,255,0)');
          ctx.fillStyle = mist;
          ctx.beginPath(); ctx.arc(mx + spraySway * 1.4, my - h * 0.18, 14, 0, Math.PI * 2); ctx.fill();
        }
        // Puddle sheen on warm terra-cotta — wet patches reflecting sky
        for (let i = 0; i < 6; i++) {
          const x = (i * 123.7) % w;
          const y = h * 0.68 + (i * 53.7) % (h * 0.22);
          const R = 18 + (i % 3) * 8;
          const sheen = ctx.createRadialGradient(x, y, 0, x, y, R);
          sheen.addColorStop(0, 'rgba(120,210,240,0.22)');
          sheen.addColorStop(1, 'rgba(120,210,240,0)');
          ctx.fillStyle = sheen;
          ctx.beginPath(); ctx.ellipse(x, y, R, R * 0.55, 0, 0, Math.PI * 2); ctx.fill();
        }
        // Palm shade shadow — soft dappled shade cloth shadow across ground
        ctx.fillStyle = 'rgba(40,60,30,0.08)';
        ctx.beginPath();
        ctx.ellipse(w * 0.72, h * 0.72, w * 0.22, h * 0.06, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        for (let i = 0; i < 5; i++) {
          const x = w * 0.72 + (i - 2) * 18;
          const y = h * 0.72 + Math.sin(i * 0.9) * 3;
          ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
        }
        return;
      }
      case 'cactus': {
        // Lifelike Desert Oasis playground — soft high sun with heat haze, plus a shaded ramada cloth for kids.
        const sun = ctx.createRadialGradient(w * 0.12, h * 0.1, 0, w * 0.12, h * 0.1, Math.min(w, h) * 0.22);
        sun.addColorStop(0, 'rgba(255,248,200,0.88)');
        sun.addColorStop(0.35, 'rgba(255,236,160,0.28)');
        sun.addColorStop(1, 'rgba(255,236,160,0)');
        ctx.fillStyle = sun;
        ctx.fillRect(0, 0, w, h * 0.45);
        // Heat haze near horizon — warm shimmer
        ctx.fillStyle = 'rgba(255,235,180,0.10)';
        ctx.fillRect(0, h * 0.38, w, h * 0.10);
        // Distant mesa silhouette — soft, not sharp
        ctx.fillStyle = 'rgba(160,110,60,0.14)';
        ctx.beginPath();
        ctx.moveTo(0, h * 0.40);
        for (let x = 0; x <= w; x += w / 10) {
          ctx.lineTo(x, h * 0.40 - Math.sin(x * 0.008) * h * 0.015 - (x % (w/3) < w/8 ? h * 0.012 : 0));
        }
        ctx.lineTo(w, h * 0.42); ctx.lineTo(0, h * 0.42); ctx.closePath(); ctx.fill();
        // Turquoise shade cloth haze top — indicates oasis playground shade
        ctx.fillStyle = 'rgba(90,200,200,0.10)';
        ctx.fillRect(w * 0.55, h * 0.08, w * 0.42, h * 0.06);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        for (let i = 0; i < 4; i++) {
          const sx = w * (0.60 + i * 0.08) + Math.sin(t * 0.0004 + i) * 2;
          ctx.beginPath(); ctx.arc(sx, h * 0.11, 2, 0, Math.PI * 2); ctx.fill();
        }
        return;
      }
    }
  }

  /** Scenery that stands in front of the pit — playground equipment, trees,
   *  buildings and other props rooted in the side/bottom margins, so nothing
   *  gets cut off by the trench. Everything scales with `cell` and is gated
   *  on the margin being wide enough to fit (tiny opponent mini-boards get
   *  none of it). */
  private drawForegroundDecor(ctx: CanvasRenderingContext2D, w: number, h: number, cell: number, ox: number, oy: number, map: BoardMapTheme): void {
    const rightX = ox + cell * COLS;
    const leftCx = ox / 2;
    const rightCx = rightX + (w - rightX) / 2;
    const leftOK = ox >= cell * 0.8;
    const rightOK = w - rightX >= cell * 0.8;
    const roomy = (side: number) => side >= cell * 2;
    const t = performance.now();
    const s = cell;

    // ── swing set ────────────────────────────────────────────────────────
    const drawSwingSet = (cx: number, gy: number) => {
      const legBase = s * 0.9, barH = gy - s * 2.9;
      ctx.strokeStyle = 'rgba(120,80,40,0.8)';
      ctx.lineWidth = Math.max(2, s * 0.07);
      ctx.beginPath();
      ctx.moveTo(cx - legBase, gy); ctx.lineTo(cx, barH); ctx.lineTo(cx + legBase, gy);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(90,90,100,0.85)';
      ctx.lineWidth = Math.max(2, s * 0.06);
      ctx.beginPath(); ctx.moveTo(cx - legBase, barH); ctx.lineTo(cx + legBase, barH); ctx.stroke();
      for (let i = -1; i <= 1; i += 2) {
        const x0 = cx + i * legBase * 0.55;
        const sway = Math.sin(t / 900 + i) * s * 0.12;
        const seatY = gy - s * 0.55;
        ctx.strokeStyle = 'rgba(70,70,80,0.7)';
        ctx.lineWidth = Math.max(1, s * 0.03);
        ctx.beginPath();
        ctx.moveTo(x0, barH);
        ctx.lineTo(x0 + sway, seatY);
        ctx.stroke();
        ctx.fillStyle = 'rgba(140,100,50,0.85)';
        ctx.fillRect(x0 + sway - s * 0.18, seatY, s * 0.36, s * 0.06);
      }
    };

    // ── slide ───────────────────────────────────────────────────────────
    const drawSlide = (cx: number, gy: number) => {
      const topY = gy - s * 2.4;
      const x0 = cx - s * 0.8;
      ctx.strokeStyle = 'rgba(120,80,40,0.85)';
      ctx.lineWidth = Math.max(2, s * 0.06);
      ctx.beginPath();
      ctx.moveTo(x0, gy); ctx.lineTo(x0 + s * 0.25, topY);
      ctx.moveTo(x0 + s * 0.55, gy); ctx.lineTo(x0 + s * 0.8, topY);
      ctx.stroke();
      for (let i = 1; i <= 3; i++) {
        const tt = i / 4;
        const y1 = gy - (gy - topY) * tt;
        const x1 = x0 + s * 0.25 * tt, x2 = x0 + s * 0.8 - s * 0.25 * tt;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y1); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(150,110,60,0.9)';
      ctx.lineWidth = Math.max(3, s * 0.1);
      ctx.beginPath();
      ctx.moveTo(x0 + s * 0.8, topY + s * 0.1);
      ctx.quadraticCurveTo(cx + s * 1.1, topY + s * 1.5, cx + s * 0.7, gy - s * 0.05);
      ctx.stroke();
    };

    // ── monkey bars ─────────────────────────────────────────────────────
    const drawMonkeyBars = (cx: number, gy: number) => {
      const topY = gy - s * 2.6;
      ctx.strokeStyle = 'rgba(90,90,100,0.85)';
      ctx.lineWidth = Math.max(2, s * 0.055);
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.9, gy); ctx.lineTo(cx - s * 0.6, topY);
      ctx.moveTo(cx + s * 0.9, gy); ctx.lineTo(cx + s * 0.6, topY);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - s * 0.6, topY); ctx.lineTo(cx + s * 0.6, topY); ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const x = cx - s * 0.5 + i * s * 0.25;
        ctx.beginPath(); ctx.arc(x, topY + s * 0.18, s * 0.12, Math.PI, 0); ctx.stroke();
      }
    };

    // ── seesaw ──────────────────────────────────────────────────────────
    const drawSeesaw = (cx: number, gy: number) => {
      ctx.fillStyle = 'rgba(90,60,30,0.85)';
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.15, gy); ctx.lineTo(cx + s * 0.15, gy); ctx.lineTo(cx, gy - s * 0.5);
      ctx.closePath();
      ctx.fill();
      const rock = Math.sin(t / 1800) * 0.08;
      ctx.save();
      ctx.translate(cx, gy - s * 0.5);
      ctx.rotate(rock);
      ctx.fillStyle = 'rgba(150,110,60,0.9)';
      ctx.fillRect(-s * 1.0, -s * 0.06, s * 2.0, s * 0.12);
      ctx.restore();
      ctx.strokeStyle = 'rgba(90,60,30,0.9)';
      ctx.lineWidth = Math.max(1, s * 0.04);
      ctx.beginPath(); ctx.moveTo(cx - s * 0.7, gy - s * 0.42); ctx.lineTo(cx - s * 0.4, gy - s * 0.42); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + s * 0.4, gy - s * 0.42); ctx.lineTo(cx + s * 0.7, gy - s * 0.42); ctx.stroke();
    };

    // ── ball ────────────────────────────────────────────────────────────
    const drawBall = (x: number, y: number) => {
      ctx.fillStyle = 'rgba(210,60,70,0.95)';
      ctx.beginPath(); ctx.arc(x, y, s * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(240,240,240,0.9)';
      ctx.lineWidth = Math.max(1, s * 0.04);
      ctx.beginPath(); ctx.arc(x, y, s * 0.22, -0.5, 0.5); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath(); ctx.arc(x - s * 0.08, y - s * 0.08, s * 0.05, 0, Math.PI * 2); ctx.fill();
    };

    // ── palm tree ───────────────────────────────────────────────────────
    const drawPalm = (cx: number, gy: number) => {
      ctx.strokeStyle = 'rgba(140,100,55,0.9)';
      ctx.lineWidth = Math.max(2, s * 0.1);
      ctx.beginPath();
      ctx.moveTo(cx, gy);
      ctx.quadraticCurveTo(cx - s * 0.3, gy - s * 1.4, cx + s * 0.1, gy - s * 2.4);
      ctx.stroke();
      const tx = cx + s * 0.1, ty = gy - s * 2.4;
      ctx.strokeStyle = 'rgba(40,120,70,0.9)';
      ctx.lineWidth = Math.max(2, s * 0.09);
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI * 0.95 + i * Math.PI * 0.32;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.quadraticCurveTo(tx + Math.cos(a) * s * 0.7, ty + Math.sin(a) * s * 0.7, tx + Math.cos(a) * s * 1.15, ty + Math.sin(a) * s * 1.15);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(90,60,30,0.9)';
      ctx.beginPath(); ctx.arc(tx - s * 0.08, ty + s * 0.06, s * 0.07, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(tx + s * 0.1, ty + s * 0.08, s * 0.06, 0, Math.PI * 2); ctx.fill();
    };

    // ── pine tree (optionally snow-capped) ──────────────────────────────
    const drawPine = (cx: number, gy: number, snowy = true) => {
      ctx.fillStyle = 'rgba(90,60,30,0.9)';
      ctx.fillRect(cx - s * 0.07, gy - s * 0.5, s * 0.14, s * 0.5);
      ctx.fillStyle = snowy ? 'rgba(40,110,90,0.9)' : 'rgba(40,110,60,0.9)';
      for (let i = 0; i < 3; i++) {
        const yy = gy - s * (0.5 + i * 0.7);
        const ww = s * (0.8 - i * 0.2);
        ctx.beginPath();
        ctx.moveTo(cx, yy - s * 0.7);
        ctx.lineTo(cx - ww, yy + s * 0.15);
        ctx.lineTo(cx + ww, yy + s * 0.15);
        ctx.closePath();
        ctx.fill();
      }
      if (snowy) {
        ctx.fillStyle = 'rgba(240,248,255,0.9)';
        for (let i = 0; i < 3; i++) {
          const yy = gy - s * (0.5 + i * 0.7);
          const ww = s * (0.8 - i * 0.2);
          ctx.beginPath();
          ctx.moveTo(cx, yy - s * 0.7);
          ctx.lineTo(cx - ww * 0.55, yy - s * 0.05);
          ctx.lineTo(cx + ww * 0.55, yy - s * 0.05);
          ctx.closePath();
          ctx.fill();
        }
      }
    };

    // ── snowman ─────────────────────────────────────────────────────────
    const drawSnowman = (cx: number, gy: number) => {
      ctx.fillStyle = 'rgba(245,250,255,0.95)';
      ctx.beginPath(); ctx.arc(cx, gy - s * 0.28, s * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, gy - s * 0.78, s * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, gy - s * 1.16, s * 0.15, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(230,140,40,0.95)';
      ctx.lineWidth = Math.max(1.5, s * 0.05);
      ctx.beginPath(); ctx.moveTo(cx, gy - s * 1.18); ctx.lineTo(cx + s * 0.2, gy - s * 1.1); ctx.stroke();
      ctx.fillStyle = 'rgba(30,30,40,0.95)';
      ctx.beginPath(); ctx.arc(cx - s * 0.05, gy - s * 1.2, s * 0.025, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + s * 0.05, gy - s * 1.2, s * 0.025, 0, Math.PI * 2); ctx.fill();
    };

    // ── rocket ──────────────────────────────────────────────────────────
    const drawRocket = (cx: number, gy: number) => {
      const top = gy - s * 2.6;
      ctx.fillStyle = 'rgba(235,238,245,0.95)';
      ctx.beginPath();
      ctx.moveTo(cx, top);
      ctx.lineTo(cx + s * 0.32, gy - s * 0.9);
      ctx.lineTo(cx - s * 0.32, gy - s * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(120,180,255,0.95)';
      ctx.beginPath(); ctx.arc(cx, gy - s * 1.5, s * 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(220,80,70,0.95)';
      ctx.beginPath(); ctx.moveTo(cx - s * 0.32, gy - s * 1.1); ctx.lineTo(cx - s * 0.6, gy - s * 0.7); ctx.lineTo(cx - s * 0.2, gy - s * 0.85); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx + s * 0.32, gy - s * 1.1); ctx.lineTo(cx + s * 0.6, gy - s * 0.7); ctx.lineTo(cx + s * 0.2, gy - s * 0.85); ctx.closePath(); ctx.fill();
      const fl = 0.7 + 0.3 * Math.sin(t / 90);
      ctx.fillStyle = `rgba(255,150,60,${fl.toFixed(2)})`;
      ctx.beginPath(); ctx.moveTo(cx - s * 0.16, gy - s * 0.85); ctx.lineTo(cx + s * 0.16, gy - s * 0.85); ctx.lineTo(cx, gy - s * 0.85 - s * 0.5 * fl); ctx.closePath(); ctx.fill();
    };

    // ── skyscraper ──────────────────────────────────────────────────────
    const drawSkyscraper = (cx: number, gy: number, seed: number) => {
      const hgt = s * (2.2 + (seed % 3) * 0.8);
      const wdt = s * (0.7 + (seed % 2) * 0.25);
      ctx.fillStyle = 'rgba(20,16,40,0.95)';
      ctx.fillRect(cx - wdt / 2, gy - hgt, wdt, hgt);
      ctx.strokeStyle = 'rgba(40,40,60,0.9)';
      ctx.lineWidth = Math.max(1, s * 0.03);
      ctx.beginPath(); ctx.moveTo(cx, gy - hgt); ctx.lineTo(cx, gy - hgt - s * 0.5); ctx.stroke();
      for (let r = 0; r < Math.floor(hgt / (s * 0.22)); r++) {
        for (let c = 0; c < 3; c++) {
          const wx = cx - wdt / 2 + s * 0.1 + c * wdt * 0.3;
          const wy = gy - hgt + s * 0.12 + r * s * 0.22;
          if ((r * 3 + c + seed) % 4 !== 0) continue;
          const pulse = 0.5 + 0.5 * Math.sin(t / 600 + r + c + seed);
          ctx.fillStyle = `rgba(0,255,255,${(0.35 + 0.5 * pulse).toFixed(2)})`;
          ctx.fillRect(wx, wy, s * 0.14, s * 0.1);
        }
      }
      if (seed % 2 === 0) {
        const pulse = 0.5 + 0.5 * Math.sin(t / 400 + seed);
        ctx.fillStyle = `rgba(255,0,220,${(0.4 + 0.5 * pulse).toFixed(2)})`;
        ctx.fillRect(cx - wdt * 0.4, gy - hgt - s * 0.28, wdt * 0.8, s * 0.12);
      }
    };

    // ── oak tree ────────────────────────────────────────────────────────
    const drawOak = (cx: number, gy: number) => {
      ctx.fillStyle = 'rgba(100,70,35,0.9)';
      ctx.fillRect(cx - s * 0.09, gy - s * 0.8, s * 0.18, s * 0.8);
      ctx.fillStyle = 'rgba(60,140,70,0.95)';
      ctx.beginPath();
      ctx.arc(cx, gy - s * 1.3, s * 0.55, 0, Math.PI * 2);
      ctx.arc(cx - s * 0.4, gy - s * 1.05, s * 0.4, 0, Math.PI * 2);
      ctx.arc(cx + s * 0.4, gy - s * 1.05, s * 0.4, 0, Math.PI * 2);
      ctx.fill();
    };

    // ── picket fence ────────────────────────────────────────────────────
    const drawFence = (x0: number, x1: number, gy: number) => {
      ctx.strokeStyle = 'rgba(150,110,60,0.8)';
      ctx.lineWidth = Math.max(1.5, s * 0.05);
      const n = Math.max(3, Math.floor((x1 - x0) / (s * 0.4)));
      for (let i = 0; i <= n; i++) {
        const x = x0 + (x1 - x0) * (i / n);
        ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy - s * 0.5); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(x0, gy - s * 0.42); ctx.lineTo(x1, gy - s * 0.42); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x0, gy - s * 0.22); ctx.lineTo(x1, gy - s * 0.22); ctx.stroke();
    };

    // ── mesa ────────────────────────────────────────────────────────────
    const drawMesa = (cx: number, gy: number) => {
      ctx.fillStyle = 'rgba(160,90,50,0.85)';
      ctx.beginPath();
      ctx.moveTo(cx - s * 1.1, gy);
      ctx.lineTo(cx - s * 0.7, gy - s * 1.6);
      ctx.lineTo(cx + s * 0.7, gy - s * 1.6);
      ctx.lineTo(cx + s * 1.1, gy);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(190,120,70,0.9)';
      ctx.fillRect(cx - s * 0.7, gy - s * 1.6, s * 1.4, s * 0.15);
    };

    // ── cactus ──────────────────────────────────────────────────────────
    const drawCactus = (cx: number, gy: number) => {
      ctx.fillStyle = 'rgba(40,95,45,0.9)';
      const cw = Math.max(2, s * 0.09);
      const ch = s * (0.9 + ((cx * 7) % 5) * 0.08);
      ctx.fillRect(cx - cw / 2, gy - ch, cw, ch);
      ctx.fillRect(cx - cw * 2.2, gy - ch * 0.62, cw * 0.75, ch * 0.4);
      ctx.fillRect(cx - cw * 2.2, gy - ch * 0.62, cw * 2.2, cw * 0.9);
      ctx.fillRect(cx + cw * 1.4, gy - ch * 0.55, cw * 0.75, ch * 0.35);
      ctx.fillRect(cx + cw * 1.4, gy - ch * 0.55, cw, cw * 0.9);
    };

    // ── volcano ─────────────────────────────────────────────────────────
    const drawVolcano = (cx: number, gy: number) => {
      ctx.fillStyle = 'rgba(50,30,26,0.95)';
      ctx.beginPath();
      ctx.moveTo(cx - s * 1.3, gy);
      ctx.quadraticCurveTo(cx, gy - s * 1.2, cx + s * 1.3, gy);
      ctx.closePath();
      ctx.fill();
      const pulse = 0.6 + 0.4 * Math.sin(t / 300);
      const glow = ctx.createRadialGradient(cx, gy - s * 1.0, 0, cx, gy - s * 1.0, s * 0.55);
      glow.addColorStop(0, `rgba(255,120,40,${(0.5 * pulse).toFixed(2)})`);
      glow.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(cx - s * 0.6, gy - s * 1.6, s * 1.2, s * 1.2);
      ctx.fillStyle = 'rgba(255,140,50,0.95)';
      ctx.beginPath(); ctx.arc(cx, gy - s * 1.0, s * 0.12, 0, Math.PI * 2); ctx.fill();
    };

    switch (map.decor) {
      case 'playground': {
        if (leftOK) drawSwingSet(leftCx, h);
        if (rightOK) drawSlide(rightCx, h);
        if (leftOK && roomy(ox)) drawMonkeyBars(leftCx * 0.5, h);
        if (rightOK && roomy(w - rightX)) {
          drawSeesaw(rightCx - s * 1.4, h);
          drawBall(rightCx + s * 1.3, h - s * 0.2);
        } else if (leftOK) {
          drawBall(leftCx, h - s * 0.2);
        }
        return;
      }
      case 'waves': {
        if (leftOK) drawPalm(leftCx, h);
        if (rightOK) drawPalm(rightCx, h);
        drawBall(leftOK ? leftCx + s * 0.6 : w * 0.5, h - s * 0.2);
        return;
      }
      case 'snow': {
        if (leftOK) drawPine(leftCx, h, true);
        if (rightOK) {
          drawSnowman(rightCx - s * 0.8, h);
          if (roomy(w - rightX)) drawPine(rightCx + s * 0.9, h, true);
        }
        return;
      }
      case 'stars': {
        if (leftOK) drawRocket(leftCx, h);
        // Ringed gas giant peeking over the horizon on the right.
        if (rightOK) {
          const px = rightCx, py = h - s * 0.6, pr = s * 1.5;
          ctx.fillStyle = 'rgba(220,160,90,0.9)';
          ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(230,180,110,0.85)';
          ctx.lineWidth = Math.max(2, s * 0.14);
          ctx.beginPath();
          ctx.ellipse(px, py - pr * 0.15, pr * 1.7, pr * 0.5, -0.3, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = 'rgba(190,110,60,0.9)';
          ctx.beginPath(); ctx.arc(px - pr * 0.3, py + pr * 0.2, pr * 0.45, 0, Math.PI * 2); ctx.fill();
        }
        return;
      }
      case 'neon': {
        if (leftOK) drawSkyscraper(leftCx, h, 0);
        if (rightOK) drawSkyscraper(rightCx, h, 1);
        if (leftOK && roomy(ox)) drawSkyscraper(leftCx * 0.55, h, 2);
        return;
      }
      case 'clouds': {
        if (leftOK) drawOak(leftCx, h);
        if (rightOK) drawOak(rightCx, h);
        drawFence(0, w, h);
        // Wildflower patch along the bottom strip.
        for (let i = 0; i < 14; i++) {
          const fx = (i * 97.7) % w;
          const fy = h - 4 - ((i * 43.9) % (s * 0.7));
          const col = ['255,120,120', '255,220,80', '200,140,255', '255,255,255'][i % 4];
          ctx.fillStyle = `rgba(${col},0.85)`;
          ctx.beginPath(); ctx.arc(fx, fy, Math.max(1.5, s * 0.05), 0, Math.PI * 2); ctx.fill();
        }
        return;
      }
      case 'cactus': {
        if (leftOK) { drawMesa(leftCx, h); drawCactus(leftCx + s * 1.1, h); }
        if (rightOK) { drawMesa(rightCx, h); drawCactus(rightCx - s * 1.1, h); }
        // Tumbleweed rolling across the bottom strip.
        const tw = (t / 9000) % 1;
        const twx = tw * (w + 80) - 40;
        const twy = h - s * 0.3 - Math.sin(tw * Math.PI * 4) * s * 0.25;
        ctx.strokeStyle = 'rgba(140,110,60,0.8)';
        ctx.lineWidth = Math.max(1, s * 0.03);
        for (let i = 0; i < 5; i++) {
          const a = tw * Math.PI * 2 + i * 1.26;
          ctx.beginPath();
          ctx.arc(twx + Math.cos(a) * s * 0.16, twy + Math.sin(a) * s * 0.16, s * 0.12, 0, Math.PI * 2);
          ctx.stroke();
        }
        return;
      }
      case 'lava': {
        if (leftOK) drawVolcano(leftCx, h);
        if (rightOK) drawVolcano(rightCx, h);
        // Rising embers.
        for (let i = 0; i < 14; i++) {
          const cyc = ((t / 2200 + i / 14) % 1);
          const x = ((i * 61.7) % w);
          const y = h - cyc * (h * 0.7);
          const flick = 0.5 + 0.5 * Math.sin(t / 120 + i * 2.1);
          ctx.fillStyle = `rgba(255,${(120 + flick * 100) | 0},50,${(0.3 + 0.4 * flick * (1 - cyc)).toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(x, y, 1.5 + cyc * 2, 0, Math.PI * 2);
          ctx.fill();
        }
        return;
      }
      default:
        return;
    }
  }

  /** A recessed dirt trench carved into the ground — the original game's board
   *  is a trough dug into the dirt with beveled edges, not a wooden pegboard. */
  private drawTrench(ctx: CanvasRenderingContext2D, cell: number, ox: number, oy: number): void {
    const pad = cell * 0.5;
    const bw = cell * COLS + pad * 2;
    const bh = cell * ROWS + pad * 2;
    const bx = ox - pad, by = oy - pad - cell * 0.4;

    // Darker, recessed pit interior (map-tinted).
    const map = this.boardMap;
    const dirt = ctx.createLinearGradient(bx, by, bx, by + bh);
    dirt.addColorStop(0, map.pit[0]);
    dirt.addColorStop(0.5, map.pit[1]);
    dirt.addColorStop(1, map.pit[2]);
    ctx.fillStyle = dirt;
    this.roundRect(ctx, bx, by, bw, bh, cell * 0.2);
    ctx.fill();

    // Carved-edge bevel: light from top-left, so the inner top/left walls are
    // in shadow and the inner bottom/right walls catch light — reads as dug in.
    const inset = cell * 0.1;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = cell * 0.24;
    ctx.beginPath();
    ctx.moveTo(bx + inset, by + inset);
    ctx.lineTo(bx + bw - inset, by + inset);
    ctx.moveTo(bx + inset, by + inset);
    ctx.lineTo(bx + inset, by + bh - inset);
    ctx.stroke();

    ctx.strokeStyle = this.boardMap.bevelLight;
    ctx.lineWidth = cell * 0.22;
    ctx.beginPath();
    ctx.moveTo(bx + inset, by + bh - inset);
    ctx.lineTo(bx + bw - inset, by + bh - inset);
    ctx.moveTo(bx + bw - inset, by + inset);
    ctx.lineTo(bx + bw - inset, by + bh - inset);
    ctx.stroke();

    // Lip of the trench — a light rim so the edge stands out from the ground.
    ctx.strokeStyle = this.boardMap.lip;
    ctx.lineWidth = Math.max(1, cell * 0.07);
    this.roundRect(ctx, bx, by, bw, bh, cell * 0.2);
    ctx.stroke();

    // Subtle speckle so the trough floor still reads as dirt, not flat paint.
    ctx.fillStyle = 'rgba(0,0,0,0.13)';
    for (let i = 0; i < 56; i++) {
      const x = bx + ((i * 61.7) % bw);
      const y = by + ((i * 37.3) % bh);
      ctx.beginPath();
      ctx.arc(x, y, 1 + (i % 3) * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,232,190,0.10)';
    for (let i = 0; i < 36; i++) {
      const x = bx + ((i * 83.1) % bw);
      const y = by + ((i * 47.9) % bh);
      ctx.beginPath();
      ctx.arc(x, y, 0.8 + (i % 2) * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawMarbleFace(ctx: CanvasRenderingContext2D, colorId: number, seed: number, r: number, roll: number): void {
    // Baking context: the face is drawn into an offscreen sprite centred at
    // (0,0) once per colour+seed, then blitted — rotated by the live roll —
    // each frame. Everything here is deterministic given the seed, so the
    // expensive pipeline below only runs a handful of times per match.
    const x = 0, y = 0;
    const base = COLORS[colorId] ?? COLORS[1];

    // Per-marble identity: the seed gives every marble its own tint, pattern
    // angle/thickness and highlight position, so no two marbles (even the same
    // colour) look alike. The pattern *type* is fixed per colour family so it
    // stays recognisable to colour-blind players. The seed is deterministic,
    // so a marble keeps its look while it slides around the board.
    const s0 = mhash(seed);
    const s1 = mhash(seed + 101);
    const s2 = mhash(seed + 203);
    const s3 = mhash(seed + 307);
    const s4 = mhash(seed + 409);
    const s5 = mhash(seed + 509);

    // Per-marble glass identity: each channel jitters independently (subtle
    // value shift), the dominant channel is lifted for richer saturation, and
    // the whole colour is then hue-rotated only a few degrees per marble — so
    // two reds can lean coral or crimson, but every marble stays clearly
    // inside its own colour family (orange never drifts into yellow, etc.).
    const t0 = clamp255(base[0] * (0.87 + s0 * 0.20));
    const t1 = clamp255(base[1] * (0.87 + s1 * 0.20));
    const t2 = clamp255(base[2] * (0.87 + s2 * 0.20));
    const maxI = t0 >= t1 && t0 >= t2 ? 0 : (t1 >= t2 ? 1 : 2);
    const sat = 14 + s3 * 20;
    const tinted = rotateHue([
      maxI === 0 ? clamp255(t0 + sat) : t0,
      maxI === 1 ? clamp255(t1 + sat) : t1,
      maxI === 2 ? clamp255(t2 + sat) : t2,
    ], (s4 - 0.5) * 12);
    const gloss = 0.5 + s5 * 0.5; // per-marble shininess (0.5..1.0)
    // Skin per colour: each color family has a set of pattern types; the
    // marble's seed picks which one, so the look is deterministic per marble
    // (it keeps the same skin while sliding around the board) yet varied.
    const skins = SKINS[colorId] ?? SKINS[1] ?? [0];
    const style = skins[Math.floor(s0 * skins.length) % skins.length];

    // Glass body — deeper 6-stop sphere gradient with a bright core fading
    // to a dark transparent edge, so it reads as dense glass rather than a
    // painted disc. Light source stays top-left.
    const grad = ctx.createRadialGradient(x - r * 0.38, y - r * 0.4, r * 0.04, x, y, r);
    grad.addColorStop(0, lighten(tinted, 0.85));
    grad.addColorStop(0.16, lighten(tinted, 0.52));
    grad.addColorStop(0.38, lighten(tinted, 0.22));
    grad.addColorStop(0.62, `rgb(${tinted[0]},${tinted[1]},${tinted[2]})`);
    grad.addColorStop(0.85, darken(tinted, 0.42));
    grad.addColorStop(1, darken(tinted, 0.74));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Molten core — a denser, brighter heart many glass marbles have. It
    // gives the colour depth and a soft interior glow instead of a flat fill.
    const core = ctx.createRadialGradient(x - r * 0.2, y - r * 0.18, 0, x, y, r * 0.55);
    core.addColorStop(0, `rgba(${Math.min(255, tinted[0] + 60)},${Math.min(255, tinted[1] + 60)},${Math.min(255, tinted[2] + 60)},0.5)`);
    core.addColorStop(0.6, `rgba(${tinted[0]},${tinted[1]},${tinted[2]},0.18)`);
    core.addColorStop(1, `rgba(${tinted[0]},${tinted[1]},${tinted[2]},0)`);
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.95, 0, Math.PI * 2);
    ctx.fill();

    // Inner detail (clipped to the sphere), rotating as the marble rolls.
    // A real rolling marble spins the surface at v/r — roll already carries
    // the full v/r angle (see update()), so rotate by the full amount.
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.92, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(x, y);
    ctx.rotate(roll + s2 * Math.PI * 2);
    ctx.lineCap = 'round';

    switch (style) {
      case 0: {
        // Swirl veins — classic marbled glass.
        const veins = 2;
        for (let i = 0; i < veins; i++) {
          const a = (i / veins) * Math.PI * 2 + s3 * Math.PI;
          ctx.strokeStyle = i % 2 === 0 ? lighten(tinted, 0.45) : darken(tinted, 0.2);
          ctx.lineWidth = r * (0.14 + s3 * 0.08);
          ctx.beginPath();
          ctx.arc(0, 0, r * (0.35 + s3 * 0.25), a, a + Math.PI * (0.8 + s2 * 0.4));
          ctx.stroke();
        }
        break;
      }
      case 1: {
        // Flecked — scattered darker/lighter inclusions.
        ctx.fillStyle = darken(tinted, 0.32);
        for (let i = 0; i < 4; i++) {
          const a = s3 * Math.PI * 2 + i * 1.62;
          const d = r * (0.15 + ((s2 * (i + 1)) % 1) * 0.5);
          ctx.beginPath();
          ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r * (0.07 + s2 * 0.06), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = lighten(tinted, 0.5);
        for (let i = 0; i < 2; i++) {
          const a = s2 * Math.PI * 2 + i * 2.4;
          const d = r * (0.1 + ((s3 * (i + 2)) % 1) * 0.5);
          ctx.beginPath();
          ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r * 0.06, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 2: {
        // Cat's-eye band across the middle.
        const a = s3 * Math.PI;
        ctx.strokeStyle = lighten(tinted, 0.38);
        ctx.lineWidth = r * 0.26;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.4, a, a + Math.PI * 0.55);
        ctx.stroke();
        ctx.strokeStyle = darken(tinted, 0.28);
        ctx.lineWidth = r * 0.12;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.4, a + Math.PI * 0.12, a + Math.PI * 0.5);
        ctx.stroke();
        break;
      }
      case 3: {
        // Concentric rings — a bullseye that reads at a glance.
        ctx.strokeStyle = darken(tinted, 0.22);
        for (let i = 0; i < 3; i++) {
          ctx.lineWidth = r * (0.1 + i * 0.04);
          ctx.beginPath();
          ctx.arc(0, 0, r * (0.22 + i * 0.24), 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      }
      case 4: {
        // Spiral — a single continuous curl.
        ctx.strokeStyle = lighten(tinted, 0.4);
        ctx.lineWidth = r * 0.12;
        ctx.beginPath();
        const turns = 2.5;
        const segs = 40;
        for (let i = 0; i <= segs; i++) {
          const t = i / segs;
          const a = s2 * Math.PI * 2 + t * turns * Math.PI * 2;
          const rr = r * (0.06 + t * 0.55);
          const px = Math.cos(a) * rr;
          const py = Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        break;
      }
      case 6: {
        // Starburst — short rays radiating from a bright core.
        const rays = 8 + Math.floor(s2 * 4);
        ctx.strokeStyle = lighten(tinted, 0.42);
        ctx.lineWidth = r * (0.06 + s3 * 0.04);
        for (let i = 0; i < rays; i++) {
          const a = s3 * Math.PI * 2 + (i / rays) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r * 0.12, Math.sin(a) * r * 0.12);
          ctx.lineTo(Math.cos(a) * r * (0.55 + s2 * 0.2), Math.sin(a) * r * (0.55 + s2 * 0.2));
          ctx.stroke();
        }
        ctx.fillStyle = lighten(tinted, 0.55);
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 7: {
        // Dice dots — a clear five-dot face (quincunx) that reads instantly.
        ctx.fillStyle = darken(tinted, 0.3);
        for (let i = 0; i < 5; i++) {
          const ang = s3 * Math.PI * 2 + (i / 5) * Math.PI * 2 + 0.4;
          const d = i < 4 ? r * 0.34 : 0;
          ctx.beginPath();
          ctx.arc(Math.cos(ang) * d, Math.sin(ang) * d, r * 0.13, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      default: {
        // Stripes — parallel bands across the sphere.
        ctx.lineWidth = r * 0.11;
        for (let i = -2; i <= 2; i++) {
          ctx.strokeStyle = i % 2 === 0 ? lighten(tinted, 0.42) : darken(tinted, 0.24);
          const off = i * r * 0.34;
          ctx.beginPath();
          ctx.moveTo(off, -r);
          ctx.lineTo(off, r);
          ctx.stroke();
        }
        break;
      }
    }
    ctx.restore();

    // Secondary translucent swirl — a large, faint counter-rotating ribbon
    // under the main pattern so even the simplest skins get layered depth.
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.9, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(x, y);
    ctx.rotate(-roll * 0.6 + s4 * Math.PI * 2);
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(${tinted[0]},${tinted[1]},${tinted[2]},0.16)`;
    ctx.lineWidth = r * 0.3;
    ctx.beginPath();
    ctx.arc(0, 0, r * (0.5 + s5 * 0.2), s4 * Math.PI * 2, s4 * Math.PI * 2 + Math.PI * 1.4);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.lineWidth = r * 0.15;
    ctx.beginPath();
    ctx.arc(0, 0, r * (0.28 + s4 * 0.32), s5 * Math.PI * 2 + Math.PI, s5 * Math.PI * 2 + Math.PI * 2.1);
    ctx.stroke();
    ctx.restore();

    // Surface grain — a dusting of near-invisible specks that gives the glass
    // a hand-blown, slightly imperfect texture. Deterministic per marble.
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.9, 0, Math.PI * 2);
    ctx.clip();
    for (let i = 0; i < 7; i++) {
      const gx = x + (mhash(seed + 801 + i) - 0.5) * r * 1.7;
      const gy = y + (mhash(seed + 901 + i) - 0.5) * r * 1.7;
      const gr = r * (0.012 + mhash(seed + 1001 + i) * 0.03);
      const bright = mhash(seed + 1101 + i) > 0.5;
      ctx.fillStyle = bright ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
      ctx.beginPath();
      ctx.arc(gx, gy, gr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Interior bubbles — tiny glass inclusions that stay put while the
    // surface pattern rolls beneath them, like air pockets caught in the
    // glass near the viewer. Count, position and size all vary per marble.
    const bubbles = 1 + Math.floor(s3 * 2); // 1..2
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.9, 0, Math.PI * 2);
    ctx.clip();
    for (let i = 0; i < bubbles; i++) {
      const bx = x + (mhash(seed + 501 + i) - 0.5) * r * 1.15;
      const by = y + (mhash(seed + 601 + i) - 0.5) * r * 1.15;
      const br = r * (0.04 + mhash(seed + 701 + i) * 0.06);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.26)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // ── Sphere curvature shadow ────────────────────────────────────────
    // A soft darkening toward the rim (except where the light hits) makes
    // the flat pattern read as painted on a curved sphere instead of a
    // printed disc. Light source is top-left, so darken the lower-right.
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.95, 0, Math.PI * 2);
    ctx.clip();
    const curve = ctx.createRadialGradient(x, y, r * 0.35, x, y, r * 1.05);
    curve.addColorStop(0, 'rgba(0,0,0,0)');
    curve.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = curve;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    const rimShade = ctx.createLinearGradient(x - r * 0.8, y - r * 0.8, x + r * 0.8, y + r * 0.8);
    rimShade.addColorStop(0, 'rgba(0,0,0,0)');
    rimShade.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = rimShade;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();

    // ── Specular highlight (FIXED to the light source) ─────────────────
    // Real glass: the light reflection stays in one place while the pattern
    // rolls beneath it. Any sway here would read as a spinning coin, not a
    // rolling marble — so the highlight position only varies by marble seed.
    const hx = x - r * (0.26 + s0 * 0.18);
    const hy = y - r * (0.32 + s1 * 0.16);

    // Crisp core + soft halo, pegged to the fixed light position and scaled
    // by the marble's gloss so some marbles read shinier than others.
    ctx.fillStyle = `rgba(255,255,255,${(0.9 * gloss).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(hx, hy, r * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${(0.34 * gloss).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(hx, hy, r * 0.26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${(0.12 * gloss).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(hx, hy, r * 0.48, 0, Math.PI * 2);
    ctx.fill();

    // Secondary catchlight — a faint twin reflection offset toward the edge,
    // like a second light source reflecting in the curved glass.
    ctx.fillStyle = `rgba(255,255,255,${(0.26 * gloss).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(hx + r * 0.16, hy + r * 0.2, r * 0.07, 0, Math.PI * 2);
    ctx.fill();

    // Prismatic sheen — a faint cyan→magenta split across the specular halo,
    // like light dispersing through the glass edge. Scaled by gloss so shiny
    // marbles show it more.
    const sheen = ctx.createLinearGradient(hx - r * 0.3, hy - r * 0.08, hx + r * 0.3, hy + r * 0.28);
    sheen.addColorStop(0, `rgba(150,220,255,${(0.18 * gloss).toFixed(3)})`);
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
    sheen.addColorStop(1, `rgba(255,140,230,${(0.16 * gloss).toFixed(3)})`);
    ctx.fillStyle = sheen;
    ctx.beginPath();
    ctx.arc(hx, hy, r * 0.34, 0, Math.PI * 2);
    ctx.fill();

    // Rolling glint — a soft bright streak travelling with the roll,
    // clipped to the sphere so it never pokes outside the glass.
    const glint = roll;
    const gx = x + Math.cos(glint) * r * 0.5;
    const gy = y + Math.sin(glint) * r * 0.5;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.94, 0, Math.PI * 2);
    ctx.clip();
    const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, r * 0.55);
    gg.addColorStop(0, 'rgba(255,255,255,0.2)');
    gg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(gx, gy, r * 0.55, 0, Math.PI * 2);
    ctx.fill();

    // Bottom reflected rim — a faint bounce of light along the lower edge.
    const rim = ctx.createLinearGradient(x, y + r * 0.4, x, y + r);
    rim.addColorStop(0, 'rgba(255,255,255,0)');
    rim.addColorStop(1, 'rgba(255,255,255,0.22)');
    ctx.strokeStyle = rim;
    ctx.lineWidth = r * 0.2;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.85, Math.PI * 0.22, Math.PI * 0.78);
    ctx.stroke();

    // Transmitted-light caustic — light refracted through the glass pools at
    // the lower-right (opposite the specular). Tinted by the marble's colour,
    // it's the strongest cue that this is solid glass rather than a sticker.
    const cau = ctx.createRadialGradient(x + r * 0.34, y + r * 0.42, 0, x + r * 0.34, y + r * 0.42, r * 0.6);
    cau.addColorStop(0, `rgba(${Math.min(255, tinted[0] + 120)},${Math.min(255, tinted[1] + 120)},${Math.min(255, tinted[2] + 120)},0.4)`);
    cau.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cau;
    ctx.beginPath();
    ctx.arc(x + r * 0.34, y + r * 0.42, r * 0.6, 0, Math.PI * 2);
    ctx.fill();

    // Transmitted backlight along the far rim — light bleeding through the
    // thin glass edge opposite the light source (upper-right), tinted by the
    // marble's own colour.
    const back = ctx.createLinearGradient(x + r * 0.3, y - r * 0.55, x + r * 0.6, y + r * 0.3);
    back.addColorStop(0, 'rgba(0,0,0,0)');
    back.addColorStop(1, `rgba(${Math.min(255, tinted[0] + 95)},${Math.min(255, tinted[1] + 95)},${Math.min(255, tinted[2] + 95)},0.34)`);
    ctx.strokeStyle = back;
    ctx.lineWidth = r * 0.12;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.85, Math.PI * 1.06, Math.PI * 1.46);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r - 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** Cached offscreen sprites of marble faces, keyed by colour + seed (both
   *  fully determine a marble's look). Bounded by the distinct marbles that
   *  actually appear, so at most ~a few per colour+seed per match.
   *  Kept on the instance so the splash/board/opponent boards share it. */
  private _marbleCache = new Map<string, HTMLCanvasElement>();

  private marbleSprite(colorId: number, seed: number): HTMLCanvasElement {
    const key = `${colorId}:${seed}`;
    const cached = this._marbleCache.get(key);
    if (cached) return cached;
    const size = MARBLE_SPRITE_R * 2 + 2;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d')!;
    g.translate(size / 2, size / 2);
    this.drawMarbleFace(g, colorId, seed, MARBLE_SPRITE_R, 0);
    this._marbleCache.set(key, c);
    return c;
  }

  private drawMarble(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, colorId: number, roll: number, seed = 0, hotColor = this.specialColor): void {
    // Contact shadow stays flat on the ground (not rotated with the roll).
    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.72, r * 0.62, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Hot-colour pulsing glow halo, outside the sphere (not rotated).
    if (hotColor > 0 && colorId === hotColor) {
      const glow = COLORS[hotColor] ?? COLORS[1];
      const pulse = this.pulsePhase();
      const halo = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 1.7);
      halo.addColorStop(0, `rgba(${glow[0]},${glow[1]},${glow[2]},${(0.35 + pulse * 0.25).toFixed(3)})`);
      halo.addColorStop(1, `rgba(${glow[0]},${glow[1]},${glow[2]},0)`);
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.7, 0, Math.PI * 2);
      ctx.fill();
    }

    // Blit the cached face, rotated with the roll and scaled to the cell size.
    const sprite = this.marbleSprite(colorId, seed);
    const s = r / MARBLE_SPRITE_R;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(roll);
    ctx.scale(s, s);
    ctx.drawImage(sprite, -MARBLE_SPRITE_R, -MARBLE_SPRITE_R);
    ctx.restore();

    // Pulsing hot-colour rim (not rotated).
    if (hotColor > 0 && colorId === hotColor) {
      const glow = COLORS[hotColor] ?? COLORS[1];
      const pulse = this.pulsePhase();
      ctx.strokeStyle = `rgba(${Math.min(255, glow[0] + 90)},${Math.min(255, glow[1] + 90)},${Math.min(255, glow[2] + 90)},${(0.7 + pulse * 0.3).toFixed(3)})`;
      ctx.lineWidth = Math.max(1.5, r * 0.14);
      ctx.beginPath();
      ctx.arc(x, y, r - 0.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  private resizeCanvas(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const w = parent?.clientWidth || window.innerWidth;
    const h = parent?.clientHeight || window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    this.ctx = canvas.getContext('2d')!;
  }

  // ── Synthesized SFX ─────────────────────────────────────────────────────

  private ensureAudio(): AudioContext | null {
    if (!this._audio) {
      try { this._audio = new AudioContext(); } catch { return null; }
    }
    if (this._audio.state === 'suspended') this._audio.resume();
    return this._audio;
  }

  // ── Background music (Win98-style chiptune loop) ───────────────────────

  /** Start the music scheduler. Called from the toggle (user gesture), and
   *  re-armed automatically when a match starts if music is on. */
  private startMusic(): void {
    const ctx = this.ensureAudio();
    if (!ctx || this._musicTimer) return;
    if (!this._musicGain) {
      this._musicGain = ctx.createGain();
      this._musicGain.gain.value = MUSIC_VOLUME;
      this._musicGain.connect(ctx.destination);
    }
    this._musicStep = 0;
    this._musicNextTime = ctx.currentTime + 0.08;
    this._musicTimer = setInterval(() => this.scheduleMusic(), 50);
    this.cdr.detectChanges();
  }

  /** Stop the music scheduler and silence anything already queued. */
  private stopMusic(): void {
    if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
    if (this._musicGain) {
      try { this._musicGain.disconnect(); } catch { /* ignore */ }
      this._musicGain = null;
    }
    this.cdr.detectChanges();
  }

  /** Look-ahead scheduler: keep notes queued ~MUSIC_AHEAD seconds ahead so the
   *  loop stays tight even if the tab hiccups. */
  private scheduleMusic(): void {
    const ctx = this._audio;
    if (!ctx || !this._musicGain) return;
    while (this._musicNextTime < ctx.currentTime + MUSIC_AHEAD) {
      this.playMusicStep(this._musicStep, this._musicNextTime);
      this._musicNextTime += MUSIC_EIGHTH;
      this._musicStep = (this._musicStep + 1) % MUSIC_MELODY.length;
    }
  }

  /** Play one eighth-note of the loop: lead + bass + kick/hat. */
  private playMusicStep(step: number, t: number): void {
    const ctx = this._audio;
    const out = this._musicGain;
    if (!ctx || !out) return;
    const mel = NOTE[MUSIC_MELODY[step]] ?? 0;
    const bass = NOTE[MUSIC_BASS[step]] ?? 0;
    // Lead: bright square, short pluck, slight octave shimmer.
    if (mel > 0) {
      this.musicTone(out, mel, t, MUSIC_EIGHTH * 0.9, 'square', 0.055);
      this.musicTone(out, mel * 2, t, MUSIC_EIGHTH * 0.55, 'sine', 0.02);
    }
    // Bass: warm triangle on the beat.
    if (bass > 0) {
      this.musicTone(out, bass, t, MUSIC_EIGHTH * 0.95, 'triangle', 0.09);
    }
    // Drums: soft kick on each bar's downbeat, hat on the off-beats.
    if (MUSIC_KICK.includes(step)) {
      this.musicTone(out, 150, t, 0.09, 'sine', 0.16, 55);
    }
    if (MUSIC_HAT.includes(step)) {
      this.musicNoise(out, t, 0.035, 0.03);
    }
  }

  /** Schedule one note into the music bus (separate from the SFX tone()). */
  private musicTone(out: AudioNode, freq: number, t: number, dur: number, type: OscillatorType, gain: number, slideTo?: number): void {
    const ctx = this._audio;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Short filtered-noise hat (cached noise buffer). */
  private musicNoise(out: AudioNode, t: number, dur: number, gain: number): void {
    const ctx = this._audio;
    if (!ctx) return;
    if (!this._musicNoiseBuffer) {
      const len = Math.floor(ctx.sampleRate * 0.05);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      this._musicNoiseBuffer = buf;
    }
    const src = ctx.createBufferSource();
    src.buffer = this._musicNoiseBuffer;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(g).connect(out);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slideTo?: number): void {
    const ctx = this.ensureAudio();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private playClick(): void { this.tone(720, 0.06, 'square', 0.07); }

  /** Short dull thud for a denied move (blocked column shift) — a low
   *  square blip with a pitch drop over a soft sine body, so it reads as
   *  "no" rather than the bright click of a successful move. */
  private playDeny(): void {
    this.tone(160, 0.1, 'square', 0.12, 0, 95);
    this.tone(85, 0.09, 'sine', 0.11, 0.012, 50);
  }

  /** Gain multiplier for the opponent's board so its echoes stay in the
   *  background while the player's own actions ring out clearly. */
  private playDrop(quiet = false): void {
    const v = quiet ? 0.4 : 1;
    this.tone(900, 0.07, 'triangle', 0.14 * v, 0, 340);
    this.tone(220, 0.05, 'sine', 0.1 * v, 0.01, 140);
  }

  private playPop(count: number, quiet = false): void {
    const v = quiet ? 0.4 : 1;
    const n = Math.min(count, 8);
    for (let i = 0; i < n; i++) {
      this.tone(500 - i * 40, 0.12, 'square', 0.09 * v, i * 0.05, 260 - i * 25);
    }
  }

  private playRain(count: number, quiet = false): void {
    const v = quiet ? 0.4 : 1;
    const n = Math.min(count, 8);
    for (let i = 0; i < n; i++) {
      this.tone(600 - i * 30, 0.06, 'square', 0.07 * v, i * 0.05, 300 - i * 20);
    }
  }

  private playDumpBurst(quiet = false): void {
    const v = quiet ? 0.5 : 1;
    [392, 523, 659, 784, 1047, 1319].forEach((f, i) =>
      this.tone(f, 0.14, 'triangle', 0.14 * v, i * 0.045, f * 1.05));
  }

  private playWin(): void {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.12, i * 0.09));
  }

  private playLose(): void {
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.22, 'sawtooth', 0.08, i * 0.12, f * 0.92));
  }
}

/** Ease-out cubic: starts fast, settles softly — reads as a marble sliding
 *  and resting rather than creeping at a constant rate. */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Deep-copy a board so prediction never mutates the server-sent snapshot. */
function cloneBoard(board: number[][]): number[][] {
  return board.map(r => r.slice());
}

/** Cell-by-cell board equality for the dead-reckoning confirmation check. */
function boardsEqual(a: number[][], b: number[][]): boolean {
  if (a.length !== b.length) return false;
  for (let r = 0; r < a.length; r++) {
    if (!a[r] || !b[r] || a[r].length !== b[r].length) return false;
    for (let c = 0; c < a[r].length; c++) {
      if (a[r][c] !== b[r][c]) return false;
    }
  }
  return true;
}

/** True if a pitch-row array contains 3+ consecutive same-colour marbles. */
function pitchHasRun(row: number[]): boolean {
  let c = 0;
  while (c < row.length) {
    const color = row[c];
    if (!color) { c++; continue; }
    let end = c;
    while (end < row.length && row[end] === color) end++;
    if (end - c >= 3) return true;
    c = end;
  }
  return false;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
function lighten(c: [number, number, number], amt: number): string {
  return `rgb(${Math.round(c[0] + (255 - c[0]) * amt)},${Math.round(c[1] + (255 - c[1]) * amt)},${Math.round(c[2] + (255 - c[2]) * amt)})`;
}
function darken(c: [number, number, number], amt: number): string {
  return `rgb(${Math.round(c[0] * (1 - amt))},${Math.round(c[1] * (1 - amt))},${Math.round(c[2] * (1 - amt))})`;
}

/** Deterministic hash of an integer seed → [0,1). Stable across frames so a
 *  marble's pattern never changes while it's on screen. */
function mhash(n: number): number {
  let s = (n | 0) >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x45d9f3b) >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x45d9f3b) >>> 0;
  s = (s ^ (s >>> 16)) >>> 0;
  return s / 4294967296;
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** Rotate an RGB colour's hue by `deg` degrees (RGB → HSL → shift → RGB).
 *  Grey (max === min) passes through unchanged. */
function rotateHue(c: [number, number, number], deg: number): [number, number, number] {
  const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return c;
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d) + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + deg + 360) % 360;
  const c2 = (1 - Math.abs(2 * l - 1)) * s;
  const x = c2 * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c2 / 2;
  let rr = 0, gg = 0, bb = 0;
  if (h < 60) { rr = c2; gg = x; }
  else if (h < 120) { rr = x; gg = c2; }
  else if (h < 180) { gg = c2; bb = x; }
  else if (h < 240) { gg = x; bb = c2; }
  else if (h < 300) { rr = x; bb = c2; }
  else { rr = c2; bb = x; }
  return [
    clamp255(Math.round((rr + m) * 255)),
    clamp255(Math.round((gg + m) * 255)),
    clamp255(Math.round((bb + m) * 255)),
  ];
}
