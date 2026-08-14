import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppModule } from '../app.module';
import { ChildComponent } from '../child.component';
import { MarblesHubService, MarblesLobbyState, MarblesPlayer, MarblesBoardUpdate, MarblesOpponentView } from '../../services/marbles-hub.service';

const COLS = 6;
const ROWS = 12;
const PITCH_ROW = 5;

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

/** Signature inner pattern per color id (1..6), so each colour family is
 *  recognisable by shape rather than hue alone — important for colour-blind
 *  players. 0 = swirl · 1 = flecked · 2 = cat's-eye · 3 = rings ·
 *  4 = spiral · 5 = stripes. */
const PATTERNS: number[] = [0, 0, 1, 2, 3, 4, 5];

type SpritePhase = 'move' | 'pop';

interface Sprite {
  color: number;
  col: number; row: number;      // current visual position (grid units)
  tCol: number; tRow: number;    // target position
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

  status: 'splash' | 'menu' | 'lobby' | 'playing' | 'won' = 'splash';
  playerName = '';
  roomCode = '';
  joinCode = '';
  lobby: MarblesLobbyState | null = null;
  mySent = 0;
  myReserve = 0;
  specialColor = 0;
  winnerName: string | null = null;
  connected = false;
  opponents: MarblesOpponentView[] = [];
  chatMessages: { playerName: string; message: string }[] = [];
  chatDraft = '';
  showHowTo = false;
  isMenuPanelOpen = false;

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
  private _spriteSeq = 1;
  private _onResize = () => this.resizeCanvas();
  private _audio: AudioContext | null = null;

  constructor(private hub: MarblesHubService, private ngZone: NgZone, private cdr: ChangeDetectorRef) {
    super();
    this.playerName = this.parentRef?.user?.username ?? '';
  }

  ngAfterViewInit(): void {
    this.resizeCanvas();
    window.addEventListener('resize', this._onResize);

    this.hub.connectionError$.subscribe(() => { this.connected = false; this.cdr.detectChanges(); });
    this.hub.lobbyState$.subscribe(ls => this.ngZone.run(() => this.onLobbyState(ls)));
    this.hub.gameStarted$.subscribe(() => this.ngZone.run(() => {
      this.status = 'playing';
      this.winnerName = null;
      this.isMenuPanelOpen = false;
      this.sprites = [];
      this._board = [];
      this.opponents = [];
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

    this.ngZone.runOutsideAngular(() => {
      this.lastTime = performance.now();
      this.animId = requestAnimationFrame(t => this.loop(t));
    });
  }

  ngOnDestroy(): void {
    this._destroyed = true;
    cancelAnimationFrame(this.animId);
    window.removeEventListener('resize', this._onResize);
    if (this.lobby) this.hub.leaveLobby(this.lobby.code);
    this.hub.disconnect();
    if (this._audio) { this._audio.close(); this._audio = null; }
  }

  // ── Menu / lobby actions ────────────────────────────────────────────────

  toMenu(): void { this.status = 'menu'; this.showHowTo = false; this.isMenuPanelOpen = false; this.cdr.detectChanges(); }
  backToSplash(): void { this.status = 'splash'; this.cdr.detectChanges(); }
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

  async hostGame(): Promise<void> {
    await this.join('');
  }

  /** Single-player: host a room, then immediately start vs the computer. */
  async playVsAI(difficulty: number): Promise<void> {
    const name = this.playerName.trim() || 'Player';
    this.playerName = name;
    await this.join('');
    if (!this.connected || !this.roomCode) return;
    this.hub.startVsAI(this.roomCode, difficulty);
    this.status = 'playing';
    this.winnerName = null;
    this.cdr.detectChanges();
  }

  async joinGame(): Promise<void> {
    await this.join(this.joinCode.trim());
  }

  private async join(code: string): Promise<void> {
    const name = this.playerName.trim() || 'Player';
    const userId = this.parentRef?.user?.id ?? 0;
    const res = await this.hub.joinLobby(code, name, userId);
    if (!res) {
      this.parentRef?.showNotification('Could not reach the Marbles server.');
      return;
    }
    this.connected = true;
    this.roomCode = res.code;
    this.status = res.status === 'playing' ? 'playing' : 'lobby';
    this.lobby = {
      code: res.code, hostConnectionId: res.hostConnectionId, status: res.status, players: res.players,
    };
    this.mySent = res.mySent;
    this.myReserve = res.myReserve;
    this.specialColor = res.mySpecialColor;
    this.opponents = res.opponents ?? [];
    if (this.status === 'playing') {
      this.applyBoard({ board: res.myBoard, popped: [], rained: 0, dropped: false, specialColor: res.mySpecialColor, reserve: res.myReserve, sent: res.mySent, alive: true, winnerName: null });
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
    this.sprites = [];
    this._board = [];
    this.opponents = [];
    this.winnerName = null;
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
    this.opponents = bu.opponents ?? [];
    if (bu.dropped) this.playDrop();
    if (bu.rained > 0) this.playRain(bu.rained);
    if ((bu.popped?.length ?? 0) > 0) this.playPop(bu.popped.length);
    this.applyBoard(bu);
    this.cdr.detectChanges();
  }

  private onGameWon(w: { winnerName: string }): void {
    this.winnerName = w.winnerName;
    this.status = 'won';
    this.isMenuPanelOpen = false;
    const iWon = this.winnerName === (this.lobby?.players.find(p => p.connectionId === this.hub.myConnectionId)?.playerName ?? '');
    if (iWon) this.playWin(); else this.playLose();
    this.cdr.detectChanges();
  }

  // ── Board + sprites ─────────────────────────────────────────────────────

  private applyBoard(bu: { board: number[][]; popped: { row: number; col: number; color: number }[]; rained?: number; dropped?: boolean; specialColor?: number; reserve?: number; sent?: number; alive?: boolean; winnerName?: string | null }): void {
    const newBoard = bu.board;
    const oldBoard = this._board;
    this._board = newBoard;

    // 1. Mark sprites sitting on popped cells → pop animation.
    const poppedKeys = new Set<string>();
    for (const p of bu.popped ?? []) poppedKeys.add(`${p.row},${p.col}`);
    for (const s of this.sprites) {
      if (poppedKeys.has(`${Math.round(s.row)},${s.col}`)) {
        s.phase = 'pop';
      }
    }

    // 2. Match surviving marbles to the new board by color, preferring
    //    shortest travel. Leftover new cells spawn from the top of their column.
    //    IMPORTANT: a marble may only move within its own column (gravity /
    //    column shifts) or along the pitch row (row shifts). It must NEVER
    //    match across columns for anything else — otherwise a single new
    //    marble dropping in could "steal" a same-colored marble from the
    //    next column, whose cell then steals from the column after that,
    //    and the whole board visibly shuffles sideways.
    const live = this.sprites.filter(s => s.phase !== 'pop');
    const used = new Set<Sprite>();
    const next: Sprite[] = [];

    for (let c = 0; c < COLS; c++) {
      for (let r = ROWS - 1; r >= 0; r--) {
        const color = newBoard[r]?.[c] ?? 0;
        if (!color) continue;

        // Find the closest unused same-color marble.
        let best: Sprite | null = null;
        let bestDist = Infinity;
        for (const s of live) {
          if (used.has(s) || s.color !== color) continue;
          const dr = s.row - r;
          const dc = s.col - c;
          // Same-column only, unless both ends are on the pitch row.
          if (dc !== 0 && !(r === PITCH_ROW && s.row === PITCH_ROW)) continue;
          const dist = dr * dr + dc * dc * 3;
          if (dist < bestDist) { bestDist = dist; best = s; }
        }
        if (best) {
          used.add(best);
          best.tCol = c;
          best.tRow = r;
          best.phase = 'move';
          next.push(best);
        } else {
          const sprite = this.newSprite(color, c, r);
          next.push(sprite);
        }
      }
    }

    // 3. Unmatched live sprites must have popped → pop them.
    for (const s of this.sprites) {
      if (s.phase === 'pop') { next.push(s); continue; }
      if (!used.has(s)) { s.phase = 'pop'; next.push(s); }
    }

    this.sprites = next;
  }

  private newSprite(color: number, col: number, toRow: number): Sprite {
    // Spawn above the board and fall in.
    return {
      id: this._spriteSeq++,
      color,
      col,
      row: -1 - (ROWS - 1 - toRow),
      tCol: col,
      tRow: toRow,
      scale: 1,
      roll: 0,
      stretch: 1,
      phase: 'move',
    };
  }

  // ── Controls ────────────────────────────────────────────────────────────

  shiftRow(dir: number): void {
    if (this.status !== 'playing') return;
    this.playClick();
    this.hub.shiftRow(this.roomCode, dir);
  }

  shiftColumn(dir: number): void {
    if (this.status !== 'playing') return;
    this.playClick();
    this.hub.shiftColumn(this.roomCode, this.selectedCol, dir);
  }

  selectColumn(c: number): void {
    this.selectedCol = c;
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
    else if (k >= '1' && k <= '6') { this.selectColumn(+k - 1); }
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
    if (this.status === 'playing' || this.status === 'won') {
      this.update(dt);
      this.draw();
      this.drawOpponent();
    }
  }

  private update(dt: number): void {
    for (const s of this.sprites) {
      if (s.phase === 'pop') {
        s.scale -= dt * 4.5;
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
    this.sprites = this.sprites.filter(s => !(s.phase === 'pop' && s.scale <= 0.02));
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

  /** Render the opponent's live board (no animations — just the static state). */
  private drawOpponent(): void {
    const canvas = this.opponentCanvasRef?.nativeElement;
    const board = this.opponent?.board;
    if (!canvas || !board) return;

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
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const color = board[r]?.[c] ?? 0;
        if (!color) continue;
        const px = ox + (c + 0.5) * cell;
        const py = oy + (r + 0.5) * cell;
        this.drawMarble(ctx, px, py, cell * 0.44, color, 0, r * COLS + c + 9000, this.opponent?.specialColor ?? 0);
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

    const tilt = (s0 - 0.5) * 0.18;
    const tinted: [number, number, number] = [
      clamp255(base[0] * (1 + tilt)),
      clamp255(base[1] * (1 + tilt)),
      clamp255(base[2] * (1 + tilt)),
    ];
    const style = PATTERNS[colorId] ?? 0;

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

    // Glass body — richer 4-stop sphere gradient (light from top-left).
    const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.38, r * 0.05, x, y, r);
    grad.addColorStop(0, lighten(tinted, 0.72));
    grad.addColorStop(0.3, lighten(tinted, 0.3));
    grad.addColorStop(0.62, `rgb(${tinted[0]},${tinted[1]},${tinted[2]})`);
    grad.addColorStop(1, darken(tinted, 0.7));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
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

    // Crisp core + soft halo, both pegged to the fixed light position.
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(hx, hy, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(hx, hy, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.arc(hx, hy, r * 0.5, 0, Math.PI * 2);
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

  private playDrop(): void {
    this.tone(900, 0.07, 'triangle', 0.14, 0, 340);
    this.tone(220, 0.05, 'sine', 0.1, 0.01, 140);
  }

  private playPop(count: number): void {
    const n = Math.min(count, 8);
    for (let i = 0; i < n; i++) {
      this.tone(500 - i * 40, 0.12, 'square', 0.09, i * 0.05, 260 - i * 25);
    }
  }

  private playRain(count: number): void {
    const n = Math.min(count, 8);
    for (let i = 0; i < n; i++) {
      this.tone(600 - i * 30, 0.06, 'square', 0.07, i * 0.05, 300 - i * 20);
    }
  }

  private playWin(): void {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.12, i * 0.09));
  }

  private playLose(): void {
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.22, 'sawtooth', 0.08, i * 0.12, f * 0.92));
  }
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
