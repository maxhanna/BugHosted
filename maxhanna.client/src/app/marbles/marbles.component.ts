import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppModule } from '../app.module';
import { ChildComponent } from '../child.component';
import { MarblesHubService, MarblesLobbyState, MarblesPlayer, MarblesBoardUpdate } from '../../services/marbles-hub.service';

const SIZE = 8;

/** Palette indexed by color id (1..6); 0 is empty. */
const COLORS: [number, number, number][] = [
  [0, 0, 0],
  [222, 64, 64],   // red
  [240, 148, 40],  // orange
  [244, 210, 56],  // yellow
  [72, 176, 92],   // green
  [64, 122, 222],  // blue
  [154, 92, 216],  // purple
];

interface Sprite {
  color: number;
  col: number; row: number;      // current visual position (grid units)
  tCol: number; tRow: number;    // target position
  scale: number;
  roll: number;
  clearing: boolean;
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

  status: 'menu' | 'lobby' | 'playing' | 'won' = 'menu';
  playerName = '';
  roomCode = '';
  joinCode = '';
  lobby: MarblesLobbyState | null = null;
  myScore = 0;
  gained = 0;
  targetScore = 1000;
  winner: MarblesPlayer | null = null;
  connected = false;
  chatMessages: { playerName: string; message: string }[] = [];
  chatDraft = '';

  private ctx!: CanvasRenderingContext2D;
  private sprites: Sprite[] = [];
  private selected: { r: number; c: number } | null = null;
  private animId = 0;
  private lastTime = 0;
  private _destroyed = false;
  private _board: number[][] = [];
  private _onResize = () => this.resizeCanvas();

  // Tiny synthesized SFX (no assets): swap click, match pop, win arpeggio.
  private _audio: AudioContext | null = null;

  constructor(private hub: MarblesHubService, private ngZone: NgZone, private cdr: ChangeDetectorRef) {
    super();
  }

  ngAfterViewInit(): void {
    this.resizeCanvas();
    window.addEventListener('resize', this._onResize);

    this.hub.connectionError$.subscribe(() => { this.connected = false; this.cdr.detectChanges(); });
    this.hub.lobbyState$.subscribe(ls => this.ngZone.run(() => this.onLobbyState(ls)));
    this.hub.gameStarted$.subscribe(() => this.ngZone.run(() => { this.status = 'playing'; this.winner = null; this.cdr.detectChanges(); }));
    this.hub.boardUpdate$.subscribe(bu => this.ngZone.run(() => this.onBoardUpdate(bu)));
    this.hub.scoreUpdate$.subscribe(p => this.ngZone.run(() => this.onScoreUpdate(p)));
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

  // ── Lobby actions ───────────────────────────────────────────────────────

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
    this.targetScore = res.targetScore;
    this.lobby = {
      code: res.code, hostConnectionId: res.hostConnectionId, status: res.status,
      targetScore: res.targetScore, players: res.players,
    };
    this.myScore = res.myScore;
    if (this.status === 'playing') this.applyBoard(res.myBoard);
    this.cdr.detectChanges();
  }

  toggleReady(): void {
    if (this.isMeHost()) return;
    this.hub.toggleReady(this.roomCode);
  }

  startGame(): void {
    this.hub.startGame(this.roomCode);
  }

  async leaveToMenu(): Promise<void> {
    if (this.lobby) await this.hub.leaveLobby(this.lobby.code);
    this.hub.disconnect();
    this.lobby = null;
    this.status = 'menu';
    this.sprites = [];
    this.winner = null;
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

  // ── Hub events ──────────────────────────────────────────────────────────

  private onLobbyState(ls: MarblesLobbyState): void {
    this.lobby = ls;
    this.roomCode = ls.code;
    this.targetScore = ls.targetScore;
    if (this.status === 'menu') this.status = 'lobby';
    this.cdr.detectChanges();
  }

  private onBoardUpdate(bu: MarblesBoardUpdate): void {
    if (!bu.valid) {
      // Invalid swap: server reverted it. Just deselect.
      this.selected = null;
      this.cdr.detectChanges();
      return;
    }
    this.myScore = bu.score;
    if (bu.gained > 0) {
      this.gained = bu.gained;
      this.playPop(bu.gained);
      setTimeout(() => { this.gained = 0; this.cdr.detectChanges(); }, 800);
    }
    this.applyBoard(bu.board);
    this.cdr.detectChanges();
  }

  private onScoreUpdate(p: MarblesPlayer): void {
    if (!this.lobby) return;
    const row = this.lobby.players.find(x => x.connectionId === p.connectionId);
    if (row) { row.score = p.score; row.ready = p.ready; }
    this.cdr.detectChanges();
  }

  private onGameWon(w: MarblesPlayer): void {
    this.winner = w;
    this.status = 'won';
    this.playWin();
    this.cdr.detectChanges();
  }

  // ── Board + sprites ─────────────────────────────────────────────────────

  private applyBoard(board: number[][]): void {
    this._board = board;
    const next: Sprite[] = [];
    const used = new Set<Sprite>();
    for (let c = 0; c < SIZE; c++) {
      for (let r = SIZE - 1; r >= 0; r--) {
        const color = board[r]?.[c] ?? 0;
        if (!color) continue;
        const existing = this.sprites.find(s => s.color === color && !used.has(s));
        if (existing) {
          used.add(existing);
          existing.tCol = c;
          existing.tRow = r;
          existing.clearing = false;
          next.push(existing);
        } else {
          next.push({ color, col: c, row: r - 1.2, tCol: c, tRow: r, scale: 1, roll: 0, clearing: false });
        }
      }
    }
    for (const s of this.sprites) {
      if (!used.has(s)) {
        s.clearing = true;
        next.push(s);
      }
    }
    this.sprites = next;
  }

  // ── Input ───────────────────────────────────────────────────────────────

  onPointerDown(e: PointerEvent): void {
    if (this.status !== 'playing') return;
    e.preventDefault();
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    const { cell, ox, oy } = this.layout();
    const c = Math.floor((x - ox) / cell);
    const r = Math.floor((y - oy) / cell);
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return;
    this.tapCell(r, c);
  }

  private tapCell(r: number, c: number): void {
    if (!this.selected) { this.selected = { r, c }; return; }
    if (this.selected.r === r && this.selected.c === c) { this.selected = null; return; }
    const d = Math.abs(this.selected.r - r) + Math.abs(this.selected.c - c);
    if (d === 1) {
      this.playSwap();
      const { r: r1, c: c1 } = this.selected;
      this.selected = null;
      this.hub.swap(this.roomCode, r1, c1, r, c);
    } else {
      this.selected = { r, c };
    }
  }

  // ── Render loop ─────────────────────────────────────────────────────────

  private loop(t: number): void {
    if (this._destroyed) return;
    this.animId = requestAnimationFrame(x => this.loop(x));
    const dt = Math.min((t - this.lastTime) / 1000, 0.05);
    this.lastTime = t;
    this.update(dt);
    this.draw();
  }

  private update(dt: number): void {
    for (const s of this.sprites) {
      const dc = s.tCol - s.col;
      const dr = s.tRow - s.row;
      const dist = Math.hypot(dc, dr);
      if (dist > 0.001) {
        const step = Math.min(dist, dt * 18);
        s.col += (dc / dist) * step;
        s.row += (dr / dist) * step;
        s.roll += step * 2.4;
      } else {
        s.col = s.tCol; s.row = s.tRow;
      }
      if (s.clearing) s.scale -= dt * 5;
    }
    this.sprites = this.sprites.filter(s => !(s.clearing && s.scale <= 0));
  }

  private layout(): { cell: number; ox: number; oy: number } {
    const w = this.ctx.canvas.width, h = this.ctx.canvas.height;
    const cell = Math.min(w, h) / (SIZE + 0.5);
    const ox = (w - cell * SIZE) / 2;
    const oy = (h - cell * SIZE) / 2;
    return { cell, ox, oy };
  }

  private draw(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !this.ctx) return;
    const { cell, ox, oy } = this.layout();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    const bg = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 20, canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height));
    bg.addColorStop(0, '#2b2f3a');
    bg.addColorStop(1, '#15161c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Board tray
    ctx.fillStyle = 'rgba(10, 12, 18, 0.85)';
    roundRect(ctx, ox - cell * 0.35, oy - cell * 0.35, cell * SIZE + cell * 0.7, cell * SIZE + cell * 0.7, cell * 0.4);
    ctx.fill();

    // Selection highlight
    if (this.selected) {
      const { r, c } = this.selected;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      roundRect(ctx, ox + c * cell + cell * 0.06, oy + r * cell + cell * 0.06, cell * 0.88, cell * 0.88, cell * 0.18);
      ctx.fill();
    }

    // Marbles
    for (const s of this.sprites) {
      const px = ox + (s.col + 0.5) * cell;
      const py = oy + (s.row + 0.5) * cell;
      const radius = cell * 0.42 * Math.max(0, s.scale);
      if (radius <= 0) continue;
      this.drawMarble(ctx, px, py, radius, s.color, s.roll);
    }
  }

  private drawMarble(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, colorId: number, roll: number): void {
    const base = COLORS[colorId] ?? COLORS[1];
    // Sphere body (light top-left → dark bottom-right)
    const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.38, r * 0.08, x, y, r);
    grad.addColorStop(0, lighten(base, 0.55));
    grad.addColorStop(0.45, `rgb(${base[0]},${base[1]},${base[2]})`);
    grad.addColorStop(1, darken(base, 0.6));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Rolling band — a lighter streak that rotates as the marble moves
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(roll);
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth = r * 0.2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.52, -0.45, 0.45);
    ctx.stroke();
    ctx.restore();

    // Specular highlight
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(x - r * 0.34, y - r * 0.4, r * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(x - r * 0.2, y - r * 0.24, r * 0.08, 0, Math.PI * 2);
    ctx.fill();

    // Rim shading for depth
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r - 0.5, 0, Math.PI * 2);
    ctx.stroke();
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

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0): void {
    const ctx = this.ensureAudio();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private playSwap(): void { this.tone(520, 0.08, 'triangle', 0.12); }

  private playPop(gained: number): void {
    const step = Math.min(1, gained / 150);
    this.tone(400, 0.12, 'square', 0.1);
    this.tone(300 - step * 120, 0.16, 'square', 0.09, 0.05);
  }

  private playWin(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.12, i * 0.09));
  }
}

function lighten(c: [number, number, number], amt: number): string {
  return `rgb(${Math.round(c[0] + (255 - c[0]) * amt)},${Math.round(c[1] + (255 - c[1]) * amt)},${Math.round(c[2] + (255 - c[2]) * amt)})`;
}
function darken(c: [number, number, number], amt: number): string {
  return `rgb(${Math.round(c[0] * (1 - amt))},${Math.round(c[1] * (1 - amt))},${Math.round(c[2] * (1 - amt))})`;
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
