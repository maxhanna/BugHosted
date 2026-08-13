import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppModule } from '../app.module';
import { ChildComponent } from '../child.component';
import { MarblesHubService, MarblesLobbyState, MarblesPlayer, MarblesBoardUpdate } from '../../services/marbles-hub.service';

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

type SpritePhase = 'move' | 'pop';

interface Sprite {
  color: number;
  col: number; row: number;      // current visual position (grid units)
  tCol: number; tRow: number;    // target position
  scale: number;
  roll: number;
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
  chatMessages: { playerName: string; message: string }[] = [];
  chatDraft = '';
  showHowTo = false;

  /** Currently selected column (for ↑/↓ column shifts). */
  selectedCol = 2;

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
  }

  ngAfterViewInit(): void {
    this.resizeCanvas();
    window.addEventListener('resize', this._onResize);

    this.hub.connectionError$.subscribe(() => { this.connected = false; this.cdr.detectChanges(); });
    this.hub.lobbyState$.subscribe(ls => this.ngZone.run(() => this.onLobbyState(ls)));
    this.hub.gameStarted$.subscribe(() => this.ngZone.run(() => {
      this.status = 'playing';
      this.winnerName = null;
      this.sprites = [];
      this._board = [];
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

  toMenu(): void { this.status = 'menu'; this.showHowTo = false; this.cdr.detectChanges(); }
  backToSplash(): void { this.status = 'splash'; this.cdr.detectChanges(); }
  toggleHowTo(): void { this.showHowTo = !this.showHowTo; this.playClick(); this.cdr.detectChanges(); }

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
    this.sprites = [];
    this._board = [];
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

  hotColorCss(): string {
    const base = COLORS[this.specialColor] ?? COLORS[1];
    return `radial-gradient(circle at 32% 28%, ${lighten(base, 0.55)}, rgb(${base[0]},${base[1]},${base[2]}) 55%, ${darken(base, 0.5)})`;
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
    if (bu.dropped) this.playDrop();
    if (bu.rained > 0) this.playRain(bu.rained);
    if ((bu.popped?.length ?? 0) > 0) this.playPop(bu.popped.length);
    this.applyBoard(bu);
    this.cdr.detectChanges();
  }

  private onGameWon(w: { winnerName: string }): void {
    this.winnerName = w.winnerName;
    this.status = 'won';
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
          // Vertical moves are free-er than horizontal (gravity vs row shift).
          const dr = s.row - r;
          const dc = s.col - c;
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

  onStageDown(e: PointerEvent): void {
    if (this.status !== 'playing') return;
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { cell, ox, oy } = this.layout();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    const col = Math.floor((x - ox) / cell);
    const row = Math.floor((y - oy) / cell);
    if (col >= 0 && col < COLS) this.selectedCol = col;
    // Clicking the pitch row itself shifts it right (a convenient tap target).
    if (row === PITCH_ROW && col >= 0 && col < COLS) {
      this.shiftRow(1);
    } else {
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
    }
  }

  private update(dt: number): void {
    for (const s of this.sprites) {
      if (s.phase === 'pop') {
        s.scale -= dt * 4.5;
        continue;
      }
      // Move toward target with easing; roll while sliding.
      const dc = s.tCol - s.col;
      const dr = s.tRow - s.row;
      const dist = Math.hypot(dc, dr);
      if (dist > 0.01) {
        const step = Math.min(dist, dt * 9);
        s.col += (dc / dist) * step;
        s.row += (dr / dist) * step;
        s.roll += step * 2.2;
      } else {
        s.col = s.tCol;
        s.row = s.tRow;
      }
    }
    this.sprites = this.sprites.filter(s => !(s.phase === 'pop' && s.scale <= 0.02));
  }

  private layout(): { cell: number; ox: number; oy: number } {
    const canvas = this.canvasRef?.nativeElement;
    const w = canvas?.width ?? 300, h = canvas?.height ?? 400;
    const availW = w * 0.86, availH = h * 0.88;
    const cell = Math.min(availW / COLS, availH / ROWS);
    const ox = (w - cell * COLS) / 2;
    const oy = (h - cell * ROWS) / 2;
    return { cell, ox, oy };
  }

  private draw(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !this.ctx) return;
    const { cell, ox, oy } = this.layout();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    this.drawBoardBackdrop(ctx, canvas.width, canvas.height);
    this.drawPegboard(ctx, cell, ox, oy);

    // Pitch row highlight (the center row / match zone).
    const py = oy + (PITCH_ROW + 0.5) * cell;
    const grad = ctx.createLinearGradient(ox - cell, py - cell * 0.85, ox + cell * COLS, py + cell * 0.85);
    grad.addColorStop(0, 'rgba(255, 240, 160, 0.0)');
    grad.addColorStop(0.5, 'rgba(255, 240, 160, 0.45)');
    grad.addColorStop(1, 'rgba(255, 240, 160, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(ox - cell * 0.5, py - cell * 0.8, cell * COLS + cell, cell * 1.6);
    // Row arrows on the pitch line edges.
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
      this.drawMarble(ctx, px, py2, radius, s.color, s.roll);
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
  }

  private drawBoardBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    // Classic playground look: sky gradient + dirt ground.
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.55);
    sky.addColorStop(0, '#7ec8f7');
    sky.addColorStop(1, '#cdeeff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h * 0.55);

    const ground = ctx.createLinearGradient(0, h * 0.45, 0, h);
    ground.addColorStop(0, '#a9784a');
    ground.addColorStop(0.5, '#8a5f38');
    ground.addColorStop(1, '#6f4a2b');
    ctx.fillStyle = ground;
    ctx.fillRect(0, h * 0.45, w, h * 0.55);

    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 26; i++) {
      const x = (i * 97.3) % w;
      const y = h * 0.45 + ((i * 53.7) % (h * 0.55));
      ctx.beginPath();
      ctx.arc(x, y, 1.5 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawPegboard(ctx: CanvasRenderingContext2D, cell: number, ox: number, oy: number): void {
    const pad = cell * 0.5;
    const bw = cell * COLS + pad * 2;
    const bh = cell * ROWS + pad * 2;
    const bx = ox - pad, by = oy - pad - cell * 0.4;

    const wood = ctx.createLinearGradient(bx, by, bx, by + bh);
    wood.addColorStop(0, '#8b5a2b');
    wood.addColorStop(0.5, '#7a4d24');
    wood.addColorStop(1, '#5f3a1b');
    ctx.fillStyle = wood;
    this.roundRect(ctx, bx, by, bw, bh, cell * 0.25);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = Math.max(1, cell * 0.06);
    this.roundRect(ctx, bx, by, bw, bh, cell * 0.25);
    ctx.stroke();

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const px = ox + (c + 0.5) * cell;
        const py = oy + (r + 0.5) * cell;
        const grad = ctx.createRadialGradient(px - cell * 0.1, py - cell * 0.1, cell * 0.04, px, py, cell * 0.4);
        grad.addColorStop(0, '#3a2410');
        grad.addColorStop(1, '#1c1006');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px, py, cell * 0.38, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawMarble(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, colorId: number, roll: number): void {
    const base = COLORS[colorId] ?? COLORS[1];

    const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.38, r * 0.08, x, y, r);
    grad.addColorStop(0, lighten(base, 0.62));
    grad.addColorStop(0.45, `rgb(${base[0]},${base[1]},${base[2]})`);
    grad.addColorStop(1, darken(base, 0.62));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(roll);
    for (const sign of [-1, 1]) {
      ctx.strokeStyle = `rgba(255,255,255,${sign === 1 ? 0.4 : 0.16})`;
      ctx.lineWidth = r * 0.22;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.5, 0.25 * sign, 1.15 * sign);
      ctx.stroke();
    }
    ctx.rotate(roll * 0.6);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.62, 1.6, 2.6);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(x - r * 0.34, y - r * 0.4, r * 0.17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.arc(x - r * 0.2, y - r * 0.24, r * 0.08, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r - 0.5, 0, Math.PI * 2);
    ctx.stroke();
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

function lighten(c: [number, number, number], amt: number): string {
  return `rgb(${Math.round(c[0] + (255 - c[0]) * amt)},${Math.round(c[1] + (255 - c[1]) * amt)},${Math.round(c[2] + (255 - c[2]) * amt)})`;
}
function darken(c: [number, number, number], amt: number): string {
  return `rgb(${Math.round(c[0] * (1 - amt))},${Math.round(c[1] * (1 - amt))},${Math.round(c[2] * (1 - amt))})`;
}
