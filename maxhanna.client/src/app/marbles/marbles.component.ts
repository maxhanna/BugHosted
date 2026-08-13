import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppModule } from '../app.module';
import { ChildComponent } from '../child.component';
import { MarblesHubService, MarblesLobbyState, MarblesPlayer, MarblesBoardUpdate } from '../../services/marbles-hub.service';

const COLS = 6;
const ROWS = 12;

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

type SpritePhase = 'fall' | 'rest' | 'pop';

interface Sprite {
  color: number;
  col: number; row: number;      // current visual position (grid units)
  tCol: number; tRow: number;    // target position
  vy: number;                    // fall velocity
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
  currentColor = 0;
  winnerName: string | null = null;
  connected = false;
  chatMessages: { playerName: string; message: string }[] = [];
  chatDraft = '';
  showHowTo = false;

  /** Column under the cursor / selection (for the preview marble + keyboard). */
  hoverCol = 2;

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
    this.currentColor = res.myCurrentColor;
    if (this.status === 'playing') this.applyBoard({ board: res.myBoard, popped: [], rained: 0, dropped: false, currentColor: res.myCurrentColor, sent: res.mySent, alive: true, winnerName: null });
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

  fillPercent(p: MarblesPlayer): number {
    const max = Math.max(...(p.heights ?? []), 0);
    return Math.min(100, Math.round((max / ROWS) * 100));
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
    this.currentColor = bu.currentColor;
    if (bu.dropped) this.playDrop();
    if (bu.rained > 0) this.playRain(bu.rained);
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

  private applyBoard(bu: { board: number[][]; popped: { row: number; col: number; color: number }[]; rained?: number; dropped?: boolean; currentColor?: number; sent?: number; alive?: boolean; winnerName?: string | null }): void {
    const newBoard = bu.board;
    const oldBoard = this._board;
    this._board = newBoard;

    // 1. Mark sprites sitting on popped cells → pop animation.
    const poppedKeys = new Set<string>();
    for (const p of bu.popped ?? []) poppedKeys.add(`${p.row},${p.col}`);
    for (const s of this.sprites) {
      if (s.phase === 'pop') continue;
      if (poppedKeys.has(`${Math.round(s.row)},${s.col}`) && newBoard[Math.round(s.row)]?.[s.col] === 0) {
        s.phase = 'pop';
      }
    }

    // 2. Per column: match survivors bottom-up by color, spawn the rest.
    const live = this.sprites.filter(s => s.phase !== 'pop');
    const next: Sprite[] = [];
    for (let c = 0; c < COLS; c++) {
      const newStack: number[] = [];
      for (let r = ROWS - 1; r >= 0; r--) {
        const color = newBoard[r]?.[c] ?? 0;
        if (color) newStack.push(color);
      }
      const pool = live.filter(s => s.col === c).sort((a, b) => b.row - a.row); // bottom-up
      const used = new Set<Sprite>();
      for (let i = 0; i < newStack.length; i++) {
        const color = newStack[i];
        let match: Sprite | null = null;
        for (const s of pool) {
          if (used.has(s) || s.color !== color) continue;
          match = s;
          break;
        }
        if (match) {
          used.add(match);
          match.tCol = c;
          match.tRow = ROWS - 1 - i;
          match.phase = 'rest';
          next.push(match);
        } else {
          next.push(this.newSprite(color, c, -1 - i, ROWS - 1 - i));
        }
      }
    }

    // 3. Sprites not matched (they must have popped) → pop them.
    for (const s of this.sprites) {
      if (s.phase === 'pop') { next.push(s); continue; }
      if (!next.includes(s)) { s.phase = 'pop'; next.push(s); }
    }

    this.sprites = next;
  }

  private newSprite(color: number, col: number, fromRow: number, toRow: number): Sprite {
    return {
      id: this._spriteSeq++,
      color,
      col,
      row: fromRow,
      tCol: col,
      tRow: toRow,
      vy: 0,
      scale: 1,
      roll: 0,
      phase: 'fall',
    };
  }

  // ── Input ───────────────────────────────────────────────────────────────

  onStageMove(e: PointerEvent): void {
    if (this.status !== 'playing') return;
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { cell, ox } = this.layout();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const col = Math.floor((x - ox) / cell);
    if (col >= 0 && col < COLS) this.hoverCol = col;
  }

  onStageDown(e: PointerEvent): void {
    if (this.status !== 'playing') return;
    e.preventDefault();
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { cell, ox } = this.layout();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const col = Math.floor((x - ox) / cell);
    if (col >= 0 && col < COLS) {
      this.hoverCol = col;
      this.dropInto(col);
    }
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent): void {
    if (this.status !== 'playing') return;
    const k = e.key;
    if (k >= '1' && k <= '6') { this.hoverCol = +k - 1; this.dropInto(this.hoverCol); }
    else if (k === 'ArrowLeft') { this.hoverCol = Math.max(0, this.hoverCol - 1); }
    else if (k === 'ArrowRight') { this.hoverCol = Math.min(COLS - 1, this.hoverCol + 1); }
    else if (k === ' ' || k === 'ArrowDown') { e.preventDefault(); this.dropInto(this.hoverCol); }
  }

  private dropInto(col: number): void {
    if (this.status !== 'playing' || !this.currentColor) return;
    // Optimistic: launch a marble into the column, then let the server confirm.
    const top = this.topOf(col);
    this.sprites.push(this.newSprite(this.currentColor, col, -1, top));
    this.hub.drop(this.roomCode, col);
  }

  private topOf(col: number): number {
    let h = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (this._board[r]?.[col]) h++;
      else break;
    }
    return ROWS - 1 - h;
  }

  private canvasRect(): DOMRect {
    const canvas = this.canvasRef?.nativeElement;
    return canvas ? canvas.getBoundingClientRect() : new DOMRect();
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
      if (s.phase === 'fall') {
        // Gravity fall to target row with a settle bounce.
        s.vy += dt * 26;
        s.row += s.vy * dt;
        s.roll += s.vy * dt * 0.35;
        if (s.row >= s.tRow) {
          s.row = s.tRow;
          s.vy = -s.vy * 0.35;
          if (Math.abs(s.vy) < 2.2) { s.vy = 0; s.phase = 'rest'; this.playClickQuiet(); }
        }
      } else {
        // Glide to target (cascade settle).
        const dr = s.tRow - s.row;
        if (Math.abs(dr) > 0.01) {
          s.row += dr * Math.min(1, dt * 10);
          s.roll += Math.abs(dr) * 0.6 * Math.min(1, dt * 10);
        } else {
          s.row = s.tRow;
        }
      }
    }
    this.sprites = this.sprites.filter(s => !(s.phase === 'pop' && s.scale <= 0.02));
  }

  private layout(): { cell: number; ox: number; oy: number } {
    const canvas = this.canvasRef?.nativeElement;
    const w = canvas?.width ?? 300, h = canvas?.height ?? 400;
    const availW = w * 0.86, availH = h * 0.9;
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

    // Marbles
    const sorted = [...this.sprites].sort((a, b) => a.row - b.row);
    for (const s of sorted) {
      const px = ox + (s.col + 0.5) * cell;
      const py = oy + (s.row + 0.5) * cell;
      const radius = cell * 0.44 * Math.max(0, s.scale);
      if (radius <= 0) continue;
      this.drawMarble(ctx, px, py, radius, s.color, s.roll);
    }

    // Preview marble for the current color, hovering above the selected column.
    if (this.status === 'playing' && this.currentColor) {
      const px = ox + (this.hoverCol + 0.5) * cell;
      const py = oy - cell * 0.85 + Math.sin(performance.now() / 300) * cell * 0.08;
      this.drawMarble(ctx, px, py, cell * 0.44, this.currentColor, performance.now() / 900);
      // Little arrow under the preview
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.moveTo(px - cell * 0.12, py + cell * 0.62);
      ctx.lineTo(px + cell * 0.12, py + cell * 0.62);
      ctx.lineTo(px, py + cell * 0.78);
      ctx.closePath();
      ctx.fill();
    }

    // HUD caption at bottom
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `bold ${Math.max(11, cell * 0.55)}px 'Segoe UI', sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Click a column to drop • 1-6 or arrows + space on keyboard', canvas.width / 2, canvas.height - 8);
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

    // A few dirt speckles for texture
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
    // Wooden board frame.
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

    // Peg holes.
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

    // Sphere body.
    const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.38, r * 0.08, x, y, r);
    grad.addColorStop(0, lighten(base, 0.62));
    grad.addColorStop(0.45, `rgb(${base[0]},${base[1]},${base[2]})`);
    grad.addColorStop(1, darken(base, 0.62));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Rolling swirl: two curved bands that rotate with travel — sells the roll.
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
    // Counter swirl on the other axis for the classic spiral look.
    ctx.rotate(roll * 0.6);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.62, 1.6, 2.6);
    ctx.stroke();
    ctx.restore();

    // Specular highlight.
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(x - r * 0.34, y - r * 0.4, r * 0.17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.arc(x - r * 0.2, y - r * 0.24, r * 0.08, 0, Math.PI * 2);
    ctx.fill();

    // Rim shading.
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

  private playClick(): void { this.tone(720, 0.06, 'square', 0.08); }
  private playClickQuiet(): void { this.tone(420, 0.05, 'sine', 0.05, 0, 260); }

  private playDrop(): void {
    // Marble clunk: quick pitch drop + a tiny noise tick.
    this.tone(900, 0.07, 'triangle', 0.14, 0, 340);
    this.tone(220, 0.05, 'sine', 0.1, 0.01, 140);
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
