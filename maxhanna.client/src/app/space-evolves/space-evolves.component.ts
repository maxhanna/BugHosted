import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';

interface SpaceBug { x: number; y: number; hp: number; maxHp: number; speed: number; size: number; phase: number; kind: 'scuttler' | 'mantis' | 'queen'; }
interface SpaceShot { x: number; y: number; vx: number; vy: number; damage: number; kind: 'laser' | 'rocket'; radius: number; homing?: boolean; }
interface SpaceUpgrade { id: string; name: string; description: string; weapon: 'laser' | 'rocket' | 'shield'; }
interface SpaceScore { username: string; score: number; wave: number; }

@Component({ selector: 'app-space-evolves', templateUrl: './space-evolves.component.html', styleUrl: './space-evolves.component.css', standalone: false })
export class SpaceEvolvesComponent extends ChildComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas', { static: true }) gameCanvas!: ElementRef<HTMLCanvasElement>;
  private ctx!: CanvasRenderingContext2D;
  private frame = 0;
  private lastTime = 0;
  private running = false;
  private saveTimer: any;
  private keys = new Set<string>();
  private touchX: number | null = null;
  private readonly saveKey = 'space-evolves-progress';

  player = { x: 0.5, y: 0.82, hp: 100, maxHp: 100, shield: 0, fireCooldown: 0, speed: 0.55 };
  shots: SpaceShot[] = [];
  bugs: SpaceBug[] = [];
  wave = 1;
  score = 0;
  level = 1;
  experience = 0;
  nextLevel = 100;
  paused = false;
  gameOver = false;
  upgradeChoices: SpaceUpgrade[] = [];
  highScores: SpaceScore[] = [];
  loadingScores = true;
  status = 'Choose an upgrade and survive the swarm.';
  private spawnTimer = 0;
  private waveKills = 0;

  readonly upgrades: SpaceUpgrade[] = [
    { id: 'laser-pulse', name: 'Pulse Lattice', description: 'Lasers fire 20% faster and pierce one extra bug.', weapon: 'laser' },
    { id: 'laser-split', name: 'Prismatic Split', description: 'Every laser branches into two angled beams.', weapon: 'laser' },
    { id: 'laser-burn', name: 'Solar Burn', description: 'Lasers deal +35 damage and briefly ignite targets.', weapon: 'laser' },
    { id: 'rocket-pair', name: 'Twin Warheads', description: 'Launch two rockets with a spread instead of one.', weapon: 'rocket' },
    { id: 'rocket-seeker', name: 'Seeker Payload', description: 'Rockets home toward the nearest evolving bug.', weapon: 'rocket' },
    { id: 'rocket-yield', name: 'Volatile Core', description: 'Rockets deal 60% more damage and explode wider.', weapon: 'rocket' },
    { id: 'shield-arc', name: 'Arc Shield', description: 'Gain 18 shield energy and reflect contact damage.', weapon: 'shield' },
    { id: 'shield-hull', name: 'Reinforced Hull', description: 'Increase maximum hull by 35 and repair 25.', weapon: 'shield' },
    { id: 'shield-thorns', name: 'Kinetic Thorns', description: 'Nearby bugs take damage whenever your shield absorbs a hit.', weapon: 'shield' },
  ];

  private stats = { laserDamage: 18, laserCooldown: 0.22, laserCount: 1, laserPierce: 0, rocketDamage: 42, rocketCooldown: 0.9, rocketCount: 1, rocketHoming: false, rocketYield: 1, shieldThorns: 0 };

  ngAfterViewInit() {
    this.ctx = this.gameCanvas.nativeElement.getContext('2d')!;
    this.resizeCanvas();
    window.addEventListener('resize', this.resizeCanvas);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.loadProgress();
    this.loadHighScores();
    this.running = true;
    this.lastTime = performance.now();
    this.frame = requestAnimationFrame(this.loop);
  }

  ngOnDestroy() {
    this.running = false;
    cancelAnimationFrame(this.frame);
    clearTimeout(this.saveTimer);
    window.removeEventListener('resize', this.resizeCanvas);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  private resizeCanvas = () => {
    const canvas = this.gameCanvas.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(320, Math.floor(rect.width * dpr));
    canvas.height = Math.max(480, Math.floor(rect.height * dpr));
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  private onKeyDown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (['arrowleft', 'arrowright', 'a', 'd', ' ', 'p'].includes(key)) event.preventDefault();
    if (key === 'p') this.paused = !this.paused;
    this.keys.add(key);
  };
  private onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.key.toLowerCase());

  pointerMove(event: PointerEvent) {
    const rect = this.gameCanvas.nativeElement.getBoundingClientRect();
    this.touchX = Math.max(0.08, Math.min(0.92, (event.clientX - rect.left) / rect.width));
  }
  pointerLeave() { this.touchX = null; }
  togglePause() { this.paused = !this.paused; }
  restart() { this.resetRun(); }

  chooseUpgrade(upgrade: SpaceUpgrade) {
    if (upgrade.weapon === 'laser') {
      if (upgrade.id === 'laser-pulse') this.stats.laserCooldown *= 0.8;
      if (upgrade.id === 'laser-split') this.stats.laserCount += 1;
      if (upgrade.id === 'laser-burn') this.stats.laserDamage *= 1.35;
    } else if (upgrade.weapon === 'rocket') {
      if (upgrade.id === 'rocket-pair') this.stats.rocketCount += 1;
      if (upgrade.id === 'rocket-seeker') this.stats.rocketHoming = true;
      if (upgrade.id === 'rocket-yield') { this.stats.rocketDamage *= 1.6; this.stats.rocketYield *= 1.35; }
    } else {
      if (upgrade.id === 'shield-arc') this.player.shield += 18;
      if (upgrade.id === 'shield-hull') { this.player.maxHp += 35; this.player.hp = Math.min(this.player.maxHp, this.player.hp + 25); }
      if (upgrade.id === 'shield-thorns') this.stats.shieldThorns += 18;
    }
    this.level++; this.nextLevel = Math.floor(this.nextLevel * 1.22);
    this.experience = 0; this.upgradeChoices = [];
    this.status = `${upgrade.name} evolved. The swarm adapts.`;
    this.saveProgress();
  }

  private loop = (time: number) => {
    if (!this.running) return;
    const delta = Math.min(0.05, Math.max(0, (time - this.lastTime) / 1000));
    this.lastTime = time;
    if (!this.paused && !this.gameOver && !this.upgradeChoices.length) this.update(delta);
    this.draw();
    this.frame = requestAnimationFrame(this.loop);
  };

  private update(delta: number) {
    const canvas = this.gameCanvas.nativeElement;
    const targetX = this.touchX ?? (this.keys.has('arrowleft') || this.keys.has('a') ? this.player.x - this.player.speed * delta : this.keys.has('arrowright') || this.keys.has('d') ? this.player.x + this.player.speed * delta : this.player.x);
    this.player.x += (Math.max(0.08, Math.min(0.92, targetX)) - this.player.x) * Math.min(1, delta * 14);
    this.player.fireCooldown -= delta;
    if (this.player.fireCooldown <= 0) { this.fire(); this.player.fireCooldown = this.stats.laserCooldown; }
    this.spawnTimer -= delta;
    if (this.spawnTimer <= 0) { this.spawnWaveBug(); this.spawnTimer = Math.max(0.16, 0.9 - this.wave * 0.025); }
    for (const shot of this.shots) {
      if (shot.homing) {
        const target = this.bugs.reduce((best, bug) => !best || bug.y < best.y ? bug : best, undefined as SpaceBug | undefined);
        if (target) { shot.vx += Math.sign(target.x - shot.x) * delta * 1.8; shot.vx = Math.max(-0.8, Math.min(0.8, shot.vx)); }
      }
      shot.x += shot.vx * delta; shot.y += shot.vy * delta;
    }
    this.shots = this.shots.filter(s => s.y > -0.1 && s.x > -0.1 && s.x < 1.1);
    for (const bug of this.bugs) { bug.y += bug.speed * delta; bug.x += Math.sin(timeSeed(bug.phase, bug.y)) * delta * 0.06; }
    for (let i = this.bugs.length - 1; i >= 0; i--) {
      const bug = this.bugs[i];
      if (bug.y > 0.95) { this.damagePlayer(Math.ceil(bug.maxHp * 0.18)); this.bugs.splice(i, 1); continue; }
      for (let j = this.shots.length - 1; j >= 0; j--) {
        const shot = this.shots[j];
        const dx = shot.x - bug.x, dy = shot.y - bug.y;
        if (dx * dx + dy * dy < (bug.size + shot.radius) ** 2) {
          bug.hp -= shot.damage;
          if (shot.kind === 'rocket') this.explode(shot.x, shot.y, shot.damage * this.stats.rocketYield);
          this.shots.splice(j, 1);
          if (bug.hp <= 0) { this.killBug(i); }
          break;
        }
      }
      if (this.bugs[i] === bug && Math.hypot(bug.x - this.player.x, bug.y - this.player.y) < bug.size + 0.055) { this.damagePlayer(Math.ceil(bug.maxHp * 0.3)); this.bugs.splice(i, 1); }
    }
    if (this.waveKills >= 8 + this.wave * 2 && this.bugs.length === 0) { this.wave++; this.waveKills = 0; this.status = `Wave ${this.wave}: the brood is mutating.`; }
    if (this.experience >= this.nextLevel) this.offerUpgrades();
    void canvas;
  }

  private fire() {
    const rocket = this.level >= 3 && this.level % 3 === 0;
    const count = rocket ? this.stats.rocketCount : this.stats.laserCount;
    for (let i = 0; i < count; i++) {
      const spread = count === 1 ? 0 : (i - (count - 1) / 2) * 0.08;
      this.shots.push({ x: this.player.x + spread, y: this.player.y - 0.05, vx: spread * 1.5, vy: rocket ? -0.62 : -1.05, damage: rocket ? this.stats.rocketDamage : this.stats.laserDamage, kind: rocket ? 'rocket' : 'laser', radius: rocket ? 0.022 : 0.009, homing: rocket && this.stats.rocketHoming });
    }
  }
  private spawnWaveBug() {
    const kind = this.wave > 7 && Math.random() < 0.1 ? 'queen' : this.wave > 3 && Math.random() < 0.25 ? 'mantis' : 'scuttler';
    const scale = 1 + this.wave * 0.13;
    const hp = (kind === 'queen' ? 130 : kind === 'mantis' ? 48 : 24) * scale;
    this.bugs.push({ x: 0.08 + Math.random() * 0.84, y: -0.05, hp, maxHp: hp, speed: (kind === 'queen' ? 0.08 : kind === 'mantis' ? 0.12 : 0.17) + this.wave * 0.003, size: kind === 'queen' ? 0.055 : kind === 'mantis' ? 0.04 : 0.029, phase: Math.random() * 100, kind });
  }
  private killBug(index: number) { if (!this.bugs[index]) return; this.bugs.splice(index, 1); this.score += 10 * this.wave; this.waveKills++; this.experience += 22; }
  private explode(x: number, y: number, damage: number) { for (const bug of this.bugs) if (Math.hypot(bug.x - x, bug.y - y) < 0.11) bug.hp -= damage * 0.35; }
  private damagePlayer(amount: number) { const absorbed = Math.min(this.player.shield, amount); this.player.shield -= absorbed; const remaining = amount - absorbed; if (absorbed && this.stats.shieldThorns) for (const bug of this.bugs) if (Math.hypot(bug.x - this.player.x, bug.y - this.player.y) < 0.16) bug.hp -= this.stats.shieldThorns; this.player.hp -= remaining; if (this.player.hp <= 0) this.endRun(); }

  private offerUpgrades() { this.upgradeChoices = [...this.upgrades].sort(() => Math.random() - 0.5).slice(0, 3); this.status = 'Evolution fork: choose one mutation.'; }
  private resetRun() { this.player = { x: 0.5, y: 0.82, hp: 100, maxHp: 100, shield: 0, fireCooldown: 0, speed: 0.55 }; this.shots = []; this.bugs = []; this.wave = 1; this.score = 0; this.level = 1; this.experience = 0; this.nextLevel = 100; this.gameOver = false; this.upgradeChoices = []; this.waveKills = 0; this.stats = { laserDamage: 18, laserCooldown: 0.22, laserCount: 1, laserPierce: 0, rocketDamage: 42, rocketCooldown: 0.9, rocketCount: 1, rocketHoming: false, rocketYield: 1, shieldThorns: 0 }; this.status = 'Choose an upgrade and survive the swarm.'; this.saveProgress(); }
  private endRun() { this.gameOver = true; this.status = `Run ended at wave ${this.wave}. Score ${this.score}.`; this.saveProgress(true); }

  private loadProgress() { try { const raw = localStorage.getItem(this.saveKey); if (!raw) return; const saved = JSON.parse(raw); if (saved && !saved.gameOver) { Object.assign(this.player, saved.player); this.wave = saved.wave || 1; this.score = saved.score || 0; this.level = saved.level || 1; this.experience = saved.experience || 0; this.nextLevel = saved.nextLevel || 100; this.stats = { ...this.stats, ...(saved.stats || {}) }; this.status = 'Saved run restored. Continue the evolution.'; } } catch { } }
  private saveProgress(dead = false) { const payload = { player: this.player, wave: this.wave, score: this.score, level: this.level, experience: this.experience, nextLevel: this.nextLevel, stats: this.stats, gameOver: dead }; try { localStorage.setItem(this.saveKey, JSON.stringify(payload)); } catch { } clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.saveProgress(), 3000); }
  private async loadHighScores() { this.loadingScores = true; try { const response = await fetch('/spaceevolves/highscores?limit=10'); if (response.ok) this.highScores = await response.json(); } catch { this.highScores = []; } finally { this.loadingScores = false; } }

  private draw() {
    const canvas = this.gameCanvas.nativeElement, ctx = this.ctx, w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h); const gradient = ctx.createLinearGradient(0, 0, 0, h); gradient.addColorStop(0, '#071936'); gradient.addColorStop(1, '#02040d'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(95, 196, 255, .12)'; ctx.lineWidth = 1; for (let y = (performance.now() / 25) % 40; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    for (const bug of this.bugs) this.drawBug(ctx, bug.x * w, bug.y * h, bug.size * w, bug);
    for (const shot of this.shots) { ctx.fillStyle = shot.kind === 'rocket' ? '#ff9d4d' : '#7cf7ff'; ctx.shadowBlur = 14; ctx.shadowColor = ctx.fillStyle; ctx.beginPath(); ctx.arc(shot.x * w, shot.y * h, Math.max(2, shot.radius * w), 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; }
    this.drawShip(ctx, this.player.x * w, this.player.y * h, Math.min(w, h) * 0.06);
  }
  private drawShip(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) { ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#c8efff'; ctx.strokeStyle = '#5bc8ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -size * 1.25); ctx.lineTo(size * .72, size); ctx.lineTo(0, size * .62); ctx.lineTo(-size * .72, size); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ffcb61'; ctx.beginPath(); ctx.arc(0, size * .75, size * .2, 0, Math.PI * 2); ctx.fill(); if (this.player.shield > 0) { ctx.strokeStyle = 'rgba(111,238,255,.7)'; ctx.beginPath(); ctx.arc(0, 0, size * 1.5, 0, Math.PI * 2); ctx.stroke(); } ctx.restore(); }
  private drawBug(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, bug: SpaceBug) { ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(bug.phase + bug.y * 10) * .12); ctx.fillStyle = bug.kind === 'queen' ? '#ff557d' : bug.kind === 'mantis' ? '#d875ff' : '#74ff91'; ctx.strokeStyle = '#d8fff0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, 0, size, size * .7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.strokeStyle = ctx.fillStyle; for (const side of [-1, 1]) for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(side * size * .45, -size * .2 + i * size * .2); ctx.lineTo(side * size * 1.4, -size * .5 + i * size * .55); ctx.stroke(); } ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-size * .3, -size * .15, size * .12, 0, Math.PI * 2); ctx.arc(size * .3, -size * .15, size * .12, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
}
function timeSeed(phase: number, y: number) { return phase + y * 17; }
