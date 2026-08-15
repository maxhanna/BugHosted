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

/** Palette indexed by color id (1..6); 0 is empty. */
const COLORS: [number, number, number][] = [
  [0, 0, 0],
  [196, 36, 44],   // red
  [228, 118, 26],  // orange
  [238, 200, 38],  // yellow
  [62, 158, 68],   // green
  [52, 104, 214],  // blue
  [142, 74, 196],  // purple
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
  [5, 1, 0],    // purple: stripes, flecked, swirl
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
  /** Set when the last finished game was single-player (for the win screen copy). */
  lastGameVsAI = false;
  private vsAIDifficulty = 0;
  private gameStartTime = 0;

  /** Currently selected column (for ↑/↓ column shifts). */
  selectedCol = 2;
  /** In-flight pointer drag: dir = vertical (column shift), hdir = horizontal (pitch-row shift). */
  private drag = { active: false, pointerId: -1, col: -1, row: -1, startX: 0, startY: 0, dir: 0, hdir: 0 };

  private ctx!: CanvasRenderingContext2D;
  private sprites: Sprite[] = [];
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

  constructor(private hub: MarblesHubService, private ngZone: NgZone, private cdr: ChangeDetectorRef, private marbles: MarblesService) {
    super();
    this.playerName = this.parentRef?.user?.username ?? '';
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
  }

  ngOnDestroy(): void {
    this._destroyed = true;
    cancelAnimationFrame(this.animId);
    if (this._publicRoomsTimer) { clearInterval(this._publicRoomsTimer); this._publicRoomsTimer = null; }
    window.removeEventListener('resize', this._onResize);
    if (this.lobby) this.hub.leaveLobby(this.lobby.code);
    this.hub.disconnect();
    if (this._audio) { this._audio.close(); this._audio = null; }
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

  async leaveToMenu(): Promise<void> {
    if (this.lobby) await this.hub.leaveLobby(this.lobby.code);
    this.hub.disconnect();
    this.lobby = null;
    this.status = 'menu';
    this.isMenuPanelOpen = false;
    this.viewingOpponent = false;
    this.sprites = [];
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
    this.lastGameVsAI = false;
    this.myScore = 0;
    this.loadHighScores();
    this.cdr.detectChanges();
  } 
  
  toMenu(): void {
    this.status = 'menu';
    this.showHowTo = false;
    this.isMenuPanelOpen = false;
    this.loadHighScores();
    this.cdr.detectChanges();
  }
  backToSplash(): void {
    this.status = 'splash';
    this.initSplash();
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
    this.playClick();
    this.cdr.detectChanges();
  }

  closeMenuPanel(): void {
    this.isMenuPanelOpen = false;
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
    // delivery doesn't make the computer's side stutter.
    const opp = this.opponents[0];
    if (opp) this._oppQueue.push({ view: opp, at: performance.now() });
    this.cdr.detectChanges();
  }

  private onGameWon(w: { winnerName: string }): void {
    this.winnerName = w.winnerName;
    this.status = 'won';
    this.isMenuPanelOpen = false;
    const iWon = this.winnerName === (this.lobby?.players.find(p => p.connectionId === this.hub.myConnectionId)?.playerName ?? '');
    if (iWon) this.playWin(); else this.playLose();
    // Only single-player (vs Computer) games count toward the leaderboard.
    this.lastGameVsAI = this.isVsAI;
    if (this.isVsAI) {
      this.submitScore();
    }
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

  private applyBoard(bu: { board: number[][]; popped: { row: number; col: number; color: number }[]; rained?: number; dropped?: boolean; rowShifted?: number; specialColor?: number; reserve?: number; sent?: number; score?: number; alive?: boolean; winnerName?: string | null }): void {
    const oldBoard = this._board;
    this._board = bu.board;
    this.sprites = this.matchSpritesToBoard(this.sprites, bu.board, oldBoard, bu.popped ?? [], bu.rowShifted ?? 0);
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

    this._oppSprites = this.matchSpritesToBoard(this._oppSprites, opp.board, oldBoard, opp.popped ?? [], opp.rowShifted ?? 0, moveDur);
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
    for (const s of sprites) {
      if (poppedKeys.has(`${s.tRow},${s.tCol}:${s.color}`)) {
        s.phase = 'pop';
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
          next.push(this.newSprite(cell.color, c, cell.r, moveDur));
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

    // 3. Unmatched live sprites must have popped → pop them.
    for (const s of sprites) {
      if (s.phase === 'pop') { next.push(s); continue; }
      if (!used.has(s)) { s.phase = 'pop'; next.push(s); }
    }

    return next;
  }

  private newSprite(color: number, col: number, toRow: number, moveDur = 0): Sprite {
    // Spawn above the board and fall in.
    const fromRow = -1 - (ROWS - 1 - toRow);
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
    // Dead reckoning: animate the shift locally right away so the board stays
    // responsive even if the server confirmation is delayed by the network.
    this.predictRowShift(dir);
    this.hub.shiftRow(this.roomCode, dir);
  }

  shiftColumn(dir: number): void {
    if (this.status !== 'playing') return;
    this.playClick();
    this.predictColumnShift(this.selectedCol, dir);
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
    this._board = nb;
    this._predictedBoard = nb;
    this.sprites = this.matchSpritesToBoard(this.sprites, nb, oldBoard, [], dir);
  }

  /** Optimistically cycle a column up/down locally, mirroring ShiftColumnOn. */
  private predictColumnShift(col: number, dir: number): void {
    if (!this._board || this._board.length !== ROWS || col < 0 || col >= COLS) return;
    const oldBoard = this._board;
    const nb = cloneBoard(oldBoard);
    const newCol = new Array<number>(ROWS);
    for (let r = 0; r < ROWS; r++) {
      newCol[r] = nb[(r - dir + ROWS) % ROWS][col];
    }
    for (let r = 0; r < ROWS; r++) nb[r][col] = newCol[r];
    this._board = nb;
    this._predictedBoard = nb;
    this.sprites = this.matchSpritesToBoard(this.sprites, nb, oldBoard, [], 0);
  }

  selectColumn(c: number): void {
    this.selectedCol = c;
    this.playClick();
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
    const k = e.key;
    if (k === 'ArrowLeft') { e.preventDefault(); this.shiftRow(-1); }
    else if (k === 'ArrowRight') { e.preventDefault(); this.shiftRow(1); }
    else if (k === 'ArrowUp') { e.preventDefault(); this.shiftColumn(-1); }
    else if (k === 'ArrowDown') { e.preventDefault(); this.shiftColumn(1); }
    else if (k === ' ') { e.preventDefault(); this.shiftRow(1); }
    else if (k >= '1' && k <= '5') { this.selectColumn(+k - 1); }
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
    const cell = this.pointerToCell(e);
    if (!cell) return;
    if (cell.col >= 0 && cell.col < COLS) this.selectedCol = cell.col;
    this.drag = { active: true, pointerId: e.pointerId, col: cell.col, row: cell.row, startX: cell.px, startY: cell.py, dir: 0, hdir: 0 };
    // Capture the pointer so the move/up events keep firing even if the
    // finger/cursor drifts off the board mid-drag.
    try { (e.currentTarget as HTMLElement)?.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
  }

  onStageMove(e: PointerEvent): void {
    if (!this.drag.active || e.pointerId !== this.drag.pointerId) return;
    // A vertical drag from ANY row shifts that whole column up/down.
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
    // Horizontal drag along the pitch row shifts the whole row left/right.
    if (this.drag.row === PITCH_ROW && Math.abs(dx) >= threshold) this.drag.hdir = dx < 0 ? -1 : 1;
    if (Math.abs(dy) >= threshold) this.drag.dir = dy < 0 ? -1 : 1;
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
      // Drag up/down from any row → shift that whole column.
      this.selectedCol = d.col;
      this.shiftColumn(d.dir);
    } else if (d.row === PITCH_ROW && onBoard) {
      // A tap on the center row still shifts the row right (existing shortcut).
      this.shiftRow(1);
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
      this.update(dt);
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
    this.sprites = this.advanceSprites(this.sprites, dt);
    this._oppSprites = this.advanceSprites(this._oppSprites, dt);
  }

  /** Apply an opponent snapshot with its quiet sound echoes, kept in lockstep
   *  with the buffered playback so the audio matches the animation. */
  private playOpponentUpdate(opp: MarblesOpponentView): void {
    this.applyOpponentBoard(opp);
    if (opp.dropped) this.playDrop(true);
    if (opp.rained > 0) this.playRain(opp.rained, true);
    if ((opp.popped?.length ?? 0) > 0) this.playPop(opp.popped.length, true);
  }

  /** Advance one sprite list toward its targets (shared by player + opponent).
   *  Timed sprites (moveDur > 0, the opponent) ease along the gap between
   *  updates; untimed sprites (the player) keep the legacy fixed-speed glide
   *  for instant input feedback. */
  private advanceSprites(sprites: Sprite[], dt: number): Sprite[] {
    for (const s of sprites) {
      if (s.phase === 'pop') {
        s.scale -= dt * 4.5;
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
    return sprites.filter(s => !(s.phase === 'pop' && s.scale <= 0.02));
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

    // Marbles
    const sorted = [...this.sprites].sort((a, b) => a.row - b.row);
    for (const s of sorted) {
      const px = ox + (s.col + 0.5) * cell;
      const py2 = oy + (s.row + 0.5) * cell;
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

    // Selected column marker (for ↑/↓ shifts).
    if (this.status === 'playing') {
      const sx = ox + (this.selectedCol + 0.5) * cell;
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
    for (const y of [yTop, yBot]) {
      // Dark groove with a bright top edge.
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = Math.max(2.5, cell * 0.15);
      ctx.beginPath();
      ctx.moveTo(ox - overhang, y);
      ctx.lineTo(ox + cell * COLS + overhang, y);
      ctx.stroke();
      ctx.strokeStyle = oneAway ? 'rgba(255, 255, 200, 1)' : 'rgba(255, 240, 160, 0.95)';
      ctx.lineWidth = Math.max(1.5, cell * (oneAway ? 0.13 : 0.09));
      ctx.beginPath();
      ctx.moveTo(ox - overhang, y - Math.max(1, cell * 0.07));
      ctx.lineTo(ox + cell * COLS + overhang, y - Math.max(1, cell * 0.07));
      ctx.stroke();
    }
  }

  /** True if a single legal slide (row ±1 or any column ±1) would form a
   *  3+ same-color run in the pitch row — the "one slide away" glow trigger. */
  private pitchOneAway(): boolean {
    const board = this._board;
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
    this.drawPitchHighlight(ctx, cell, ox, oy, false);

    // Animated marbles — same pipeline as the player's board.
    const sorted = [...this._oppSprites].sort((a, b) => a.row - b.row);
    const hotColor = this.opponent?.specialColor ?? 0;
    for (const s of sorted) {
      const px = ox + (s.col + 0.5) * cell;
      const py = oy + (s.row + 0.5) * cell;
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
  }

  private drawBoardBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    // Full dirt pit — the original board sits on packed earth, no sky.
    const ground = ctx.createLinearGradient(0, 0, 0, h);
    ground.addColorStop(0, '#9a6b3e');
    ground.addColorStop(0.5, '#8a5f38');
    ground.addColorStop(1, '#6f4a2b');
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, w, h);

    // Dirt speckle for texture.
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 60; i++) {
      const x = (i * 97.3) % w;
      const y = (i * 53.7) % h;
      ctx.beginPath();
      ctx.arc(x, y, 1.5 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,225,180,0.08)';
    for (let i = 0; i < 40; i++) {
      const x = (i * 83.1) % w;
      const y = (i * 47.9) % h;
      ctx.beginPath();
      ctx.arc(x, y, 1 + (i % 2), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** A recessed dirt trench carved into the ground — the original game's board
   *  is a trough dug into the dirt with beveled edges, not a wooden pegboard. */
  private drawTrench(ctx: CanvasRenderingContext2D, cell: number, ox: number, oy: number): void {
    const pad = cell * 0.5;
    const bw = cell * COLS + pad * 2;
    const bh = cell * ROWS + pad * 2;
    const bx = ox - pad, by = oy - pad - cell * 0.4;

    // Darker, recessed dirt interior.
    const dirt = ctx.createLinearGradient(bx, by, bx, by + bh);
    dirt.addColorStop(0, '#6e4726');
    dirt.addColorStop(0.5, '#5c3a1f');
    dirt.addColorStop(1, '#472c16');
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

    ctx.strokeStyle = 'rgba(255,222,168,0.30)';
    ctx.lineWidth = cell * 0.22;
    ctx.beginPath();
    ctx.moveTo(bx + inset, by + bh - inset);
    ctx.lineTo(bx + bw - inset, by + bh - inset);
    ctx.moveTo(bx + bw - inset, by + inset);
    ctx.lineTo(bx + bw - inset, by + bh - inset);
    ctx.stroke();

    // Lip of the trench — a light rim so the edge stands out from the dirt.
    ctx.strokeStyle = 'rgba(255,205,140,0.22)';
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

  private drawMarble(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, colorId: number, roll: number, seed = 0, hotColor = this.specialColor): void {
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

    // Per-marble glass identity: each channel jitters independently (subtle
    // hue + value shift, not just brightness), the dominant channel is lifted
    // for richer saturation, and a gloss factor varies the specular. All
    // deterministic from the seed, so a marble keeps its look as it moves.
    const t0 = clamp255(base[0] * (0.84 + s0 * 0.3));
    const t1 = clamp255(base[1] * (0.84 + s1 * 0.3));
    const t2 = clamp255(base[2] * (0.84 + s2 * 0.3));
    const maxI = t0 >= t1 && t0 >= t2 ? 0 : (t1 >= t2 ? 1 : 2);
    const sat = 16 + s3 * 18;
    const tinted: [number, number, number] = [
      maxI === 0 ? clamp255(t0 + sat) : t0,
      maxI === 1 ? clamp255(t1 + sat) : t1,
      maxI === 2 ? clamp255(t2 + sat) : t2,
    ];
    const gloss = 0.55 + s3 * 0.45; // per-marble shininess (0.55..1.0)
    // Skin per colour: each color family has a set of pattern types; the
    // marble's seed picks which one, so the look is deterministic per marble
    // (it keeps the same skin while sliding around the board) yet varied.
    const skins = SKINS[colorId] ?? SKINS[1] ?? [0];
    const style = skins[Math.floor(s0 * skins.length) % skins.length];

    // Soft contact shadow so each marble sits down into the dirt trench.
    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.72, r * 0.62, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Hot-colour glow halo, drawn first so the glass body sits on top and
    // only the ring outside the sphere stays visible.
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
    ctx.restore();

    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r - 0.5, 0, Math.PI * 2);
    ctx.stroke();

    // Bright rim for the hot colour so it pops against the other marbles.
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
