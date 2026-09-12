import { SpaceBug, SpaceProjectile, SpaceEffect, SpaceCloud, BackgroundShip, BackgroundCloud } from './space-evolves.component';
const FX_LAYER_PARAS = [.02, .045, .08];
const FX_LAYER_MULTS = [1, 2, 4];
const FX_LAYER_ALPHAS = [.5, .7, 1];
const FX_LAYER_COUNTS = [70, 40, 22];
const FX_STAR_COLORS = ['rgb(180,220,255)', 'rgb(210,225,255)', 'rgb(255,255,255)'];
const FX_NEBULA_COLORS = ['rgba(96,70,190,.32)', 'rgba(28,150,180,.28)', 'rgba(190,60,130,.22)'];
let bgW = 0, bgH = 0, bgBase: CanvasGradient | undefined, bgVignette: CanvasGradient | undefined;
export interface DrawState {
  bugs: SpaceBug[]; shots: SpaceProjectile[]; effects: SpaceEffect[]; clouds: SpaceCloud[];
  backgroundShips: BackgroundShip[]; backgroundClouds: BackgroundCloud[];
  player: { x: number; y: number };
  orbitDrones: { x: number; y: number; vx: number; vy: number; phase: number }[];
  shieldVisible: boolean; shieldRepulse: boolean; shieldRadius: number;
  frameDetail: number; sprite: HTMLImageElement | undefined; spriteReady: boolean;
}
let BUG_NODE_XY = new Float64Array(20);
const TESS_OUTER = new Float64Array(16);
const TESS_INNER = new Float64Array(16);
export function hueWarpColor(hex: string, t: number, warp: number): string {
  const n = parseInt(hex.slice(1), 16); let r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, bl = (n & 255) / 255;
  const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl), l = (mx + mn) / 2; let h = 0, s = 0;
  if (mx !== mn) {
    const dd = mx - mn; s = l > .5 ? dd / (2 - mx - mn) : dd / (mx + mn);
    if (mx === r) h = (g - bl) / dd + (g < bl ? 6 : 0); else if (mx === g) h = (bl - r) / dd + 2; else h = (r - g) / dd + 4; h *= 60;
  }
  h = (h + t * 540) % 360;
  const k = Math.min(1, warp / .45);
  const s2 = Math.min(1, s * 1.35 + .2), l2 = Math.min(.88, l * 1.1 + .16 * k);
  const c = (1 - Math.abs(2 * l2 - 1)) * s2, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l2 - c / 2, hh = h / 60;
  let rr = 0, gg = 0, bb = 0;
  if (hh < 1) { rr = c; gg = x; } else if (hh < 2) { rr = x; gg = c; } else if (hh < 3) { gg = c; bb = x; } else if (hh < 4) { gg = x; bb = c; } else if (hh < 5) { rr = x; bb = c; } else { rr = c; bb = x; }
  const to = (v: number) => Math.round(Math.max(0, Math.min(255, v * 255))).toString(16).padStart(2, '0');
  return '#' + to(rr + m) + to(gg + m) + to(bb + m);
}
export function drawBugFace(ctx: CanvasRenderingContext2D, z: number, b: SpaceBug, t: number, col: string, unitCount: number, nodes: Float64Array) {
  const headX = nodes[0], headY = nodes[1];
  const eyeZ = z * (b.boss ? .17 : .12);
  ctx.save(); ctx.translate(headX, headY);
  ctx.fillStyle = '#fff'; ctx.shadowBlur = 8; ctx.shadowColor = '#fff';
  for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(side * z * (b.boss ? .42 : .3), -z * .1, eyeZ, 0, Math.PI * 2); ctx.fill(); }
  const ang = Math.sin(t * 1.7 + b.phase) * .5;
  for (const side of [-1, 1]) {
    const ox = Math.cos(ang) * eyeZ * .35, oy = Math.sin(ang) * eyeZ * .35;
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(side * z * (b.boss ? .42 : .3) + ox, -z * .1 + oy, eyeZ * .42, 0, Math.PI * 2); ctx.fill();
  }
  ctx.shadowBlur = 0;
  const snap = b.lockedOn ? Math.abs(Math.sin(t * 14)) * .5 + .5 : .5 + Math.sin(t * 3 + b.phase) * .2;
  ctx.strokeStyle = adjustBugColor(col, .6); ctx.lineWidth = Math.max(1.5, z * .09);
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(side * z * .14, z * .16); ctx.quadraticCurveTo(side * z * .5, z * (.3 + snap * .25), side * z * (.35 + snap * .3), z * .62); ctx.stroke();
  }
  ctx.restore();
  if (b.trait === 'armored') { ctx.strokeStyle = '#f0f5ff'; ctx.globalAlpha = .7; for (let i = 0; i < unitCount; i++) { ctx.beginPath(); ctx.arc(nodes[i * 2], nodes[i * 2 + 1], z * .5, 0, Math.PI * 2); ctx.stroke(); } ctx.globalAlpha = 1; }
  if (b.trait === 'inertial') { ctx.strokeStyle = '#ffe0a3'; ctx.globalAlpha = .8; ctx.lineWidth = Math.max(1.5, z * .06); ctx.beginPath(); ctx.arc(0, 0, z * 1.15, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
  if (b.trait === 'weaver') { ctx.globalAlpha = .5; ctx.strokeStyle = '#a5f3fc'; ctx.beginPath(); ctx.arc(0, 0, z * (1.35 + Math.sin(t * 4 + b.phase) * .12), 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
}
export function twistAngle(b: SpaceBug, t: number) { return t * (1.1 + b.speed * 4) + b.phase; }
const adjustBugColorMemo = new Map<string, string>();
export function adjustBugColor(hex: string, factor: number): string {
  const key = hex + factor; const hit = adjustBugColorMemo.get(key); if (hit) return hit;
  const n = parseInt(hex.slice(1), 16); const out = `rgb(${Math.min(255, Math.floor(((n >> 16) & 255) * factor))},${Math.min(255, Math.floor(((n >> 8) & 255) * factor))},${Math.min(255, Math.floor((n & 255) * factor))})`;
  if (adjustBugColorMemo.size > 128) adjustBugColorMemo.clear();
  adjustBugColorMemo.set(key, out); return out;
}
export function drawFlak(ctx: CanvasRenderingContext2D, s: SpaceProjectile, w: number, h: number) { const px = s.x * w, py = s.y * h, ang = Math.atan2(s.vy, s.vx), r = Math.max(4, s.radius * w); ctx.save(); ctx.translate(px, py); ctx.rotate(ang); ctx.shadowBlur = 14; ctx.shadowColor = '#ff5d5d'; ctx.fillStyle = '#7a1f1f'; ctx.beginPath(); ctx.moveTo(r * 1.8, 0); ctx.lineTo(r * .2, -r * .75); ctx.lineTo(-r * 1.2, -r * .5); ctx.lineTo(-r * 1.2, r * .5); ctx.lineTo(r * .2, r * .75); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = '#ff5d5d'; ctx.beginPath(); ctx.moveTo(r * 1.8, 0); ctx.lineTo(r * .2, -r * .4); ctx.lineTo(-r * .9, -r * .28); ctx.lineTo(-r * .9, r * .28); ctx.lineTo(r * .2, r * .4); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#ffd9d9'; ctx.beginPath(); ctx.moveTo(r * 1.8, 0); ctx.lineTo(r * .7, -r * .16); ctx.lineTo(r * .7, r * .16); ctx.closePath(); ctx.fill(); ctx.restore(); }
export function drawChem(ctx: CanvasRenderingContext2D, s: SpaceProjectile, w: number, h: number) { const px = s.x * w, py = s.y * h, r = Math.max(4, s.radius * w), t = performance.now() / 1000, pulse = 1 + .12 * Math.sin(t * 12 + s.age * 8), ang = Math.atan2(s.vy, s.vx); ctx.save(); ctx.translate(px, py); ctx.rotate(ang); ctx.globalCompositeOperation = 'lighter'; ctx.shadowBlur = 18; ctx.shadowColor = '#8dff4f'; ctx.fillStyle = 'rgba(80,220,62,.22)'; ctx.beginPath(); ctx.ellipse(-r * .65, 0, r * 2.2, r * .8, 0, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = '#396f2d'; ctx.strokeStyle = '#b6ff4d'; ctx.lineWidth = Math.max(1, r * .12); ctx.beginPath(); ctx.moveTo(r * 1.25, 0); ctx.bezierCurveTo(r * .75, -r * .8, -r * .45, -r * .72, -r * .95, -r * .15); ctx.bezierCurveTo(-r * 1.25, r * .35, -r * .25, r * .75, r * 1.25, 0); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#9cff45'; ctx.beginPath(); ctx.ellipse(-r * .05, 0, r * .62 * pulse, r * .38 * pulse, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ecffd5'; ctx.beginPath(); ctx.ellipse(r * .25, -r * .13, r * .16, r * .1, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#6dff62'; ctx.globalAlpha = .8; ctx.beginPath(); ctx.moveTo(-r * .7, 0); ctx.lineTo(-r * 2.1, Math.sin(t * 18) * r * .2); ctx.lineTo(-r * .8, r * .2); ctx.closePath(); ctx.fill(); ctx.restore(); }
export function drawFlamer(ctx: CanvasRenderingContext2D, s: SpaceProjectile, w: number, h: number) {
  const px = s.x * w, py = s.y * h, ang = Math.atan2(s.vy, s.vx), r = Math.max(3, s.radius * w), flick = .85 + Math.random() * .3;
  ctx.save(); ctx.translate(px, py); ctx.rotate(ang);
  ctx.shadowBlur = 10; ctx.shadowColor = '#ff8c2e';
  ctx.fillStyle = 'rgba(255,90,20,.5)';
  ctx.beginPath(); ctx.moveTo(r * 1.7 * flick, 0); ctx.quadraticCurveTo(-r * .2, -r * .8, -r * 1.1, 0); ctx.quadraticCurveTo(-r * .2, r * .8, r * 1.7 * flick, 0); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = '#ffb13d';
  ctx.beginPath(); ctx.moveTo(r * 1.1 * flick, 0); ctx.quadraticCurveTo(-r * .1, -r * .45, -r * .7, 0); ctx.quadraticCurveTo(-r * .1, r * .45, r * 1.1 * flick, 0); ctx.fill();
  ctx.fillStyle = '#fff3c2';
  ctx.beginPath(); ctx.arc(r * .3, 0, r * .3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
export function drawPlasma(ctx: CanvasRenderingContext2D, s: SpaceProjectile, w: number, h: number) { const px = s.x * w, py = s.y * h, ang = Math.atan2(s.vy, s.vx), r = Math.max(4, s.radius * w); ctx.save(); ctx.translate(px, py); ctx.rotate(ang); ctx.shadowBlur = 18; ctx.shadowColor = '#ff66dd'; ctx.fillStyle = 'rgba(255,102,221,.35)'; ctx.beginPath(); ctx.ellipse(0, 0, r * 2.2, r * .9, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ff9df0'; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.4, r * .55, 0, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(0, 0, r * .7, r * .28, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
export function drawMissile(ctx: CanvasRenderingContext2D, s: SpaceProjectile, w: number, h: number) {
  const px = s.x * w, py = s.y * h, ang = Math.atan2(s.vy, s.vx), r = Math.max(4, s.radius * w), pulse = .9 + Math.sin(performance.now() / 55 + s.age * 8) * .1;
  ctx.save(); ctx.translate(px, py); ctx.rotate(ang);
  ctx.globalCompositeOperation = 'lighter'; ctx.shadowBlur = 10; ctx.shadowColor = '#ff6b32';
  const plume = ctx.createLinearGradient(-r * 1.05, 0, -r * 3.8, 0); plume.addColorStop(0, '#fff8cf'); plume.addColorStop(.28, '#ffb347'); plume.addColorStop(1, 'rgba(255,77,32,0)');
  ctx.fillStyle = plume; ctx.beginPath(); ctx.moveTo(-r * .8, -r * .18); ctx.lineTo(-r * (3.4 + pulse * .45), 0); ctx.lineTo(-r * .8, r * .18); ctx.closePath(); ctx.fill();
  ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0;
  ctx.fillStyle = '#202a35'; ctx.strokeStyle = '#8191a0'; ctx.lineWidth = Math.max(.7, r * .08); ctx.beginPath(); ctx.moveTo(-r * 1.02, -r * .29); ctx.lineTo(-r * 1.3, -r * .22); ctx.lineTo(-r * 1.3, r * .22); ctx.lineTo(-r * 1.02, r * .29); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffbd61'; ctx.beginPath(); ctx.arc(-r * 1.12, 0, r * .13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#263746'; ctx.strokeStyle = '#91a5b4'; ctx.lineWidth = Math.max(.6, r * .055);
  ctx.beginPath(); ctx.moveTo(-r * .42, -r * .23); ctx.lineTo(-r * 1.02, -r * .9); ctx.lineTo(-r * .9, -r * .16); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-r * .42, r * .23); ctx.lineTo(-r * 1.02, r * .9); ctx.lineTo(-r * .9, r * .16); ctx.closePath(); ctx.fill(); ctx.stroke();
  const body = ctx.createLinearGradient(0, -r * .3, 0, r * .3); body.addColorStop(0, '#eef3f3'); body.addColorStop(.45, '#9daab0'); body.addColorStop(1, '#3e4b56');
  ctx.fillStyle = body; ctx.strokeStyle = '#d8e2e4'; ctx.lineWidth = Math.max(.8, r * .07); ctx.beginPath(); ctx.moveTo(r * 1.65, 0); ctx.lineTo(r * .72, -r * .3); ctx.lineTo(-r * .9, -r * .3); ctx.lineTo(-r * 1.05, 0); ctx.lineTo(-r * .9, r * .3); ctx.lineTo(r * .72, r * .3); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#a82f2b'; ctx.fillRect(-r * .28, -r * .305, r * .22, r * .61);
  ctx.strokeStyle = '#596b78'; ctx.lineWidth = Math.max(.7, r * .045); ctx.beginPath(); ctx.moveTo(r * .62, -r * .27); ctx.lineTo(r * .62, r * .27); ctx.stroke();
  ctx.fillStyle = '#18232d'; ctx.strokeStyle = '#6d8794'; ctx.beginPath(); ctx.ellipse(r * .78, 0, r * .3, r * .13, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ff5d4d'; ctx.beginPath(); ctx.arc(r * 1.02, 0, r * .055, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
export function drawDrones(ctx: CanvasRenderingContext2D, w: number, h: number, drones: { x: number; y: number; vx: number; vy: number; phase: number }[], sprite: HTMLImageElement | undefined, spriteReady: boolean) {
  if (!drones.length) return;
  const t = performance.now() / 1000;
  ctx.save();
  for (const d of drones) {
    const x = d.x * w, y = d.y * h, sp = Math.hypot(d.vx, d.vy), angle = sp > .02 ? Math.atan2(d.vy, d.vx) + Math.PI / 2 : 0, z = Math.min(w, h) * .020;
    const frame = Math.floor(t * 8 + d.phase * 16 / (Math.PI * 2)) % 16;
    if (!drawShipSprite(ctx, x, y, z, frame, '#7dff9a', angle, sprite, spriteReady)) drawProceduralShip(ctx, x, y, z, angle, '#0d2b1a', '#7dff9a');
  }
  ctx.restore();
}
export function drawShield(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, visible: boolean, repulse: boolean, radius: number) {
  if (!visible) return;
  ctx.save(); ctx.strokeStyle = repulse ? '#8fb2ff' : '#55eaff'; ctx.shadowBlur = 18; ctx.shadowColor = repulse ? '#8fb2ff' : '#55eaff'; ctx.lineWidth = Math.max(2, z * .045); ctx.beginPath(); ctx.arc(x, y, z * (1.45 + radius * 4), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
}
export function drawBug(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, b: SpaceBug, detail: number) {
  const t = performance.now() / 1000;
  if (b.trait === 'leviathan') { drawLeviathanDodeca(ctx, x, y, z, b, t, detail); return; }
  const drawUnits = b.boss ? Math.min(10, b.maxSegments) : Math.min(8, b.maxSegments);
  let col = b.ally ? '#a66cff' : (b.chemDotTimer ?? 0) > 0 ? '#a8ff3e' : b.boss ? '#ff557d' : b.trait === 'inertial' ? '#ffc266' : b.trait === 'armored' ? '#b9c7d8' : b.trait === 'charger' ? '#ff9c4a' : b.trait === 'splitter' ? '#f5e85b' : b.trait === 'weaver' ? '#53d8ff' : b.trait === 'volatile' ? '#ff4b58' : b.trait === 'regenerator' ? '#74ff91' : b.kind === 'queen' ? '#ff557d' : b.kind === 'mantis' ? '#d875ff' : '#74ff91';
  if (b.hueWarp) col = hueWarpColor(col, t, b.hueWarp);
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 2 + b.phase) * .18); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const unitCount = Math.min(Math.max(1, b.segments), drawUnits);
  if (unitCount * 2 > BUG_NODE_XY.length) { BUG_NODE_XY = new Float64Array(unitCount * 2); }
  const spinBase = twistAngle(b, t) * (b.ally ? -1 : 1);
  for (let i = 0; i < unitCount; i++) {
    const u = unitCount === 1 ? 0 : i / (unitCount - 1) - .5;
    const wob = Math.sin(t * 2.2 + b.phase + i * 1.7);
    BUG_NODE_XY[i * 2] = Math.cos(spinBase + u * 2.8) * z * u * 1.55 + wob * z * .06 + ((b.chemDotTimer ?? 0) > 0 ? Math.sin(t * 4.6 + b.phase + i * 1.9) * z * .045 : 0);
    BUG_NODE_XY[i * 2 + 1] = Math.sin(spinBase + u * 2.8) * z * u * .65 + Math.cos(t * 1.9 + i + b.phase) * z * .07 + (b.ally ? Math.sin(t * 3.2 + b.phase + i) * z * .1 : 0) + ((b.chemDotTimer ?? 0) > 0 ? Math.cos(t * 4.1 + b.phase + i * 2.3) * z * .045 : 0);
  }
  if (detail > 0) drawBugLegs(ctx, z, b, t, unitCount, col, detail, BUG_NODE_XY);
  const innerSpin = (b.ally ? -1 : 1) * (t * (1.2 + b.speed * 5) + b.phase) + (b.hueWarp ?? 0) * 16;
  for (let i = 0; i < unitCount; i++) {
    const alive = i < b.segments;
    const nx = BUG_NODE_XY[i * 2], ny = BUG_NODE_XY[i * 2 + 1];
    const scale = z * (b.boss ? .66 : .5) * (1 + Math.sin(t * (b.boss ? 3 : 6) + b.phase + i) * .07);
    if (alive) {
      ctx.save(); ctx.translate(nx, ny);
      drawTesseractUnit(ctx, scale, innerSpin + i * .9, col, detail);
      ctx.restore();
    } else {
      ctx.save(); ctx.translate(nx, ny); ctx.globalAlpha = .18; ctx.strokeStyle = col; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, scale * .7, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  }
  ctx.strokeStyle = col; ctx.globalAlpha = .9; ctx.lineWidth = Math.max(1.5, z * .09); if (detail > 1) { ctx.shadowBlur = 10; ctx.shadowColor = col; }
  for (let i = 0; i < unitCount - 1; i++) { ctx.beginPath(); ctx.moveTo(BUG_NODE_XY[i * 2], BUG_NODE_XY[i * 2 + 1]); ctx.lineTo(BUG_NODE_XY[i * 2 + 2], BUG_NODE_XY[i * 2 + 3]); ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  if (b.ally) { const pulse = .5 + .5 * Math.sin(t * 4 + b.phase); ctx.save(); ctx.globalAlpha = .35 + .4 * pulse; ctx.strokeStyle = '#a66cff'; ctx.lineWidth = Math.max(1.5, z * .06); ctx.beginPath(); ctx.arc(0, 0, z * (1.1 + .15 * pulse), 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
  drawBugFace(ctx, z, b, t, col, unitCount, BUG_NODE_XY);
  if ((b.chemDotTimer ?? 0) > 0) drawPoisonDetails(ctx, z, b, t, unitCount, BUG_NODE_XY);
  ctx.restore();
}
export function drawLeviathanDodeca(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, b: SpaceBug, t: number, detail: number) {
  const hpFrac = Math.max(0, Math.min(1, b.hp / Math.max(1, b.maxHp)));
  let col = (b.chemDotTimer ?? 0) > 0 ? '#a8ff3e' : '#d9b8ff';
  if (b.hueWarp) col = hueWarpColor(col, t, b.hueWarp);
  const spin = t * (1.1 + b.speed * 4) + b.phase + (b.hueWarp ?? 0) * 16;
  const s = z * 1.5 * (0.72 + 0.28 * hpFrac) * (1 + Math.sin(t * 3 + b.phase) * .04);
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 2 + b.phase) * .12);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (detail > 0) {
    ctx.strokeStyle = col; ctx.globalAlpha = .55; ctx.lineWidth = Math.max(1.2, z * .07);
    ctx.beginPath();
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
      const hy = -z * .3 + i * z * .3;
      ctx.moveTo(side * z * .5, hy);
      ctx.lineTo(side * (z * 1.35 + Math.sin(t * 5 + b.phase + i * 2 + (side > 0 ? 3 : 0)) * z * .12), hy + z * .35);
    }
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  drawDodecaUnit(ctx, s, spin, col, detail);
  ctx.strokeStyle = col; ctx.globalAlpha = .85; ctx.lineWidth = Math.max(1.5, z * .07);
  ctx.beginPath(); ctx.arc(0, 0, s * 1.18, -Math.PI / 2, -Math.PI / 2 + hpFrac * Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
  const eyeZ = z * .16, ex = z * .42, ey = -z * .28;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(-ex, ey, eyeZ, 0, Math.PI * 2); ctx.arc(ex, ey, eyeZ, 0, Math.PI * 2); ctx.fill();
  const px = Math.cos(t * 1.7 + b.phase) * eyeZ * .35, py = Math.sin(t * 1.7 + b.phase) * eyeZ * .35;
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(-ex + px, ey + py, eyeZ * .45, 0, Math.PI * 2); ctx.arc(ex + px, ey + py, eyeZ * .45, 0, Math.PI * 2); ctx.fill();
  const snap = b.lockedOn ? .5 + Math.abs(Math.sin(t * 14)) * .5 : .5 + Math.sin(t * 3 + b.phase) * .2;
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, z * .08);
  ctx.beginPath();
  for (const side of [-1, 1]) { ctx.moveTo(side * z * .14, z * .3); ctx.quadraticCurveTo(side * z * .5, z * (.44 + snap * .25), side * z * (.35 + snap * .3), z * .76); }
  ctx.stroke();
  if ((b.chemDotTimer ?? 0) > 0) {
    ctx.strokeStyle = '#d8ff83'; ctx.globalAlpha = .6; ctx.lineWidth = Math.max(1, z * .05);
    ctx.beginPath(); ctx.arc(Math.sin(t * 2.2 + b.phase) * z * .5, -z * .55, z * .1, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
export function drawDodecaUnit(ctx: CanvasRenderingContext2D, s: number, spin: number, col: string, detail: number) {
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, s * .055);
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = spin * .6 + i * Math.PI / 6;
    const r = s * (i % 2 === 0 ? 1 : .88);
    const px = Math.cos(a) * r, py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.stroke();
  if (detail <= 0) return;
  const inner = s * .45, innerSpin = -spin * .8;
  ctx.lineWidth = Math.max(1, s * .04); ctx.globalAlpha = .9;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = innerSpin + i * Math.PI * 2 / 5 - Math.PI / 2;
    const px = Math.cos(a) * inner, py = Math.sin(a) * inner;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.stroke();
  if (detail <= 1) { ctx.globalAlpha = 1; return; }
  ctx.globalAlpha = .5; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = innerSpin + i * Math.PI * 2 / 5 - Math.PI / 2;
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    const o = spin * .6 + (i * 2 + 1) * Math.PI / 6;
    ctx.lineTo(Math.cos(o) * s * .88, Math.sin(o) * s * .88);
  }
  ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffffff'; ctx.globalAlpha = .85;
  ctx.beginPath(); ctx.arc(0, 0, Math.max(1, s * .06), 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
}
export function drawPoisonDetails(ctx: CanvasRenderingContext2D, z: number, b: SpaceBug, t: number, unitCount: number, nodes: Float64Array) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (let i = 0; i < Math.min(unitCount, 4); i++) {
    const nx = nodes[i * 2], ny = nodes[i * 2 + 1], phase = b.phase + i * 1.73;
    const bubble = .5 + .5 * Math.sin(t * 3.8 + phase), bx = nx + Math.sin(t * 2.4 + phase) * z * .12, by = ny - z * (.2 + .08 * bubble);
    ctx.globalAlpha = .35 + .25 * bubble; ctx.strokeStyle = '#d8ff83'; ctx.lineWidth = Math.max(1, z * .045); ctx.beginPath(); ctx.arc(bx, by, z * (.08 + .035 * bubble), 0, Math.PI * 2); ctx.stroke();
    const drip = .18 + .14 * (.5 + .5 * Math.sin(t * 2.1 + phase * 1.7));
    ctx.globalAlpha = .55; ctx.strokeStyle = '#9cff45'; ctx.lineWidth = Math.max(1, z * .055); ctx.beginPath(); ctx.moveTo(nx + Math.sin(phase) * z * .08, ny + z * .18); ctx.quadraticCurveTo(nx + Math.sin(t * 2.8 + phase) * z * .1, ny + z * .35, nx + Math.sin(t * 2.8 + phase) * z * .1, ny + z * (.35 + drip)); ctx.stroke();
  }
  ctx.globalAlpha = .7; ctx.fillStyle = '#efffc2'; const pulse = .5 + .5 * Math.sin(t * 5 + b.phase); ctx.beginPath(); ctx.arc(Math.sin(t * 2.2 + b.phase) * z * .32, -z * .38 - pulse * z * .05, z * .045, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
export function drawTesseractUnit(ctx: CanvasRenderingContext2D, s: number, spin: number, col: string, detail: number) {
  const cA = Math.cos(spin), sA = Math.sin(spin);
  const cB = Math.cos(spin * .7 + 1), sB = Math.sin(spin * .7 + 1);
  for (let c = 0; c < 8; c++) {
    const X = ((c >> 2) & 1) ? 1 : -1, Y = ((c >> 1) & 1) ? 1 : -1, Z = (c & 1) ? 1 : -1;
    const x1 = X * cA - Z * sA, z1 = X * sA + Z * cA;
    let y1 = Y * cB - sB, w1 = Y * sB + cB;
    const pw = 3 / (3 - w1 * .9), pz = 3 / (3 - z1 * .9);
    TESS_OUTER[c * 2] = x1 * s * pw * pz; TESS_OUTER[c * 2 + 1] = y1 * s * pw * pz;
    y1 = Y * cB + sB; w1 = Y * sB - cB;
    const qw = 3 / (3 - w1 * .9), qz = 3 / (3 - z1 * .9);
    TESS_INNER[c * 2] = x1 * s * qw * qz; TESS_INNER[c * 2 + 1] = y1 * s * qw * qz;
  }
  if (detail <= 0) {
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.2, s * .09); strokeCubeIdx(ctx, TESS_OUTER);
    return;
  }
  if (detail > 1) {
    ctx.strokeStyle = adjustBugColor(col, .55); ctx.globalAlpha = .55; ctx.lineWidth = 1;
    for (let c = 0; c < 8; c++) { ctx.beginPath(); ctx.moveTo(TESS_OUTER[c * 2], TESS_OUTER[c * 2 + 1]); ctx.lineTo(TESS_INNER[c * 2], TESS_INNER[c * 2 + 1]); ctx.stroke(); }
  }
  ctx.globalAlpha = 1; ctx.strokeStyle = col; if (detail > 1) { ctx.shadowBlur = 12; ctx.shadowColor = col; } ctx.lineWidth = Math.max(1.5, s * .08); strokeCubeIdx(ctx, TESS_OUTER);
  if (detail > 1) { ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = .85; ctx.lineWidth = Math.max(1, s * .05); ctx.shadowBlur = 8; strokeCubeIdx(ctx, TESS_INNER); }
  if (detail > 1) {
    const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, s * .5);
    cg.addColorStop(0, '#ffffff'); cg.addColorStop(.4, col); cg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = .8; ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, s * .5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}
/** Strokes a cube wireframe from a flat [x0,y0,x1,y1,…] scratch corner array. */
export function strokeCubeIdx(ctx: CanvasRenderingContext2D, pts: Float64Array) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]); ctx.lineTo(pts[2], pts[3]); ctx.lineTo(pts[6], pts[7]); ctx.lineTo(pts[4], pts[5]); ctx.closePath();
  ctx.moveTo(pts[8], pts[9]); ctx.lineTo(pts[10], pts[11]); ctx.lineTo(pts[14], pts[15]); ctx.lineTo(pts[12], pts[13]); ctx.closePath();
  ctx.moveTo(pts[0], pts[1]); ctx.lineTo(pts[8], pts[9]);
  ctx.moveTo(pts[2], pts[3]); ctx.lineTo(pts[10], pts[11]);
  ctx.moveTo(pts[4], pts[5]); ctx.lineTo(pts[12], pts[13]);
  ctx.moveTo(pts[6], pts[7]); ctx.lineTo(pts[14], pts[15]);
  ctx.stroke();
}
export function drawShipSprite(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, frame: number, glow: string, angle: number, sprite: HTMLImageElement | undefined, spriteReady: boolean) {
  if (!spriteReady || !sprite) return false;
  const columns = 4, rows = 4, fw = sprite.naturalWidth / columns, fh = sprite.naturalHeight / rows;
  if (!fw || !fh) return false;
  const cell = ((Math.floor(frame) % (columns * rows)) + (columns * rows)) % (columns * rows), dw = z * 2.15, dh = dw * (fh / fw);
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.imageSmoothingEnabled = false; ctx.shadowBlur = 16; ctx.shadowColor = glow;
  ctx.drawImage(sprite, (cell % columns) * fw, Math.floor(cell / columns) * fh, fw, fh, -dw / 2, -dh / 2, dw, dh); ctx.restore(); return true;
}
export function drawProceduralShip(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, angle = 0, fill = '#b9d9e8', stroke = '#66ddff') {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.beginPath(); ctx.moveTo(0, -z * 1.35); ctx.lineTo(z * .82, z * .48); ctx.lineTo(z * .42, z * .7); ctx.lineTo(0, z * .55); ctx.lineTo(-z * .42, z * .7); ctx.lineTo(-z * .82, z * .48); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = stroke; ctx.beginPath(); ctx.ellipse(0, -z * .08, z * .22, z * .48, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#8affff'; ctx.beginPath(); ctx.arc(0, z * .38, z * .12, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
export function drawBugLegs(ctx: CanvasRenderingContext2D, z: number, b: SpaceBug, t: number, unitCount: number, col: string, detail: number, nodes: Float64Array) {
  const legPairs = b.boss ? 5 : 3;
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.2, z * .07); ctx.globalAlpha = .92;
  for (const side of [-1, 1]) {
    for (let i = 0; i < legPairs; i++) {
      const ni = Math.min(i, unitCount - 1) * 2;
      const baseX = nodes[ni], baseY = nodes[ni + 1];
      const gait = t * (b.trait === 'weaver' ? 9 : 5) + b.phase + i * (Math.PI / legPairs) + (side > 0 ? Math.PI : 0);
      const lift = Math.max(0, Math.sin(gait));
      const reach = Math.cos(gait);
      const hipX = baseX + side * z * .3, hipY = baseY + z * .1;
      const bodyR = z * (b.boss ? 1.5 : 1.1);
      const footX = side * (bodyR + z * .5) + reach * z * .4;
      const footY = z * .55 + i * z * .42 - lift * z * .45;
      const kneeX = (hipX + footX) / 2 + side * z * .12;
      const kneeY = (hipY + footY) / 2 - z * .35 - lift * z * .2;
      ctx.lineWidth = Math.max(1.2, z * .075); ctx.strokeStyle = adjustBugColor(col, .8);
      ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.lineTo(kneeX, kneeY); ctx.stroke();
      ctx.lineWidth = Math.max(1, z * .06); ctx.strokeStyle = col;
      ctx.beginPath(); ctx.moveTo(kneeX, kneeY); ctx.lineTo(footX, footY); ctx.stroke();
      if (detail > 1) {
        ctx.fillStyle = adjustBugColor(col, .6);
        ctx.beginPath(); ctx.arc(footX, footY, z * .05, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
}
export function draw(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, state: DrawState) {
  const c = canvas, w = c.clientWidth, h = c.clientHeight, t = performance.now() / 1000; ctx.clearRect(0, 0, w, h);
  if (bgW !== w || bgH !== h || !bgBase || !bgVignette) { bgW = w; bgH = h; const bg = ctx.createRadialGradient(w * .5, h * .35, 10, w * .5, h * .5, w * 1.1); bg.addColorStop(0, '#0b1430'); bg.addColorStop(.55, '#050a1c'); bg.addColorStop(1, '#01030a'); bgBase = bg; const vg = ctx.createRadialGradient(w * .5, h * .5, Math.min(w, h) * .25, w * .5, h * .5, Math.max(w, h) * .75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,10,.55)'); bgVignette = vg; } ctx.fillStyle = bgBase; ctx.fillRect(0, 0, w, h); ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (let k = 0; k < 3; k++) { const nx = w * (.25 + .5 * (.5 + .5 * Math.sin(t * .05 + k * 2.1))), ny = h * (.3 + .4 * (.5 + .5 * Math.cos(t * .07 + k * 1.7))), nr = w * (.45 + k * .16); const ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr); ng.addColorStop(0, FX_NEBULA_COLORS[k]); ng.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = ng; ctx.fillRect(0, 0, w, h); } ctx.restore();
  for (const ship of state.backgroundShips) {
    const fade = Math.min(1, ship.life / 1.2, (ship.maxLife - ship.life) / 1.2), shipColor = ship.enemy ? '#ff6b9d' : '#73d8ff';
    ctx.save(); ctx.globalAlpha = .22 * fade; ctx.globalCompositeOperation = 'lighter';
    if (!drawShipSprite(ctx, ship.x * w, ship.y * h, ship.size * w, Math.floor(ship.life * 8 + ship.phase) + 12, shipColor, ship.angle, state.sprite, state.spriteReady)) drawProceduralShip(ctx, ship.x * w, ship.y * h, ship.size * w, ship.angle, ship.enemy ? '#e3b7cc' : '#b9d9e8', shipColor);
    ctx.globalAlpha = .12 * fade; ctx.strokeStyle = shipColor; ctx.lineWidth = Math.max(1, w * .0015); ctx.beginPath(); ctx.moveTo((ship.x - ship.vx * 28) * w, ship.y * h); ctx.lineTo((ship.x - ship.vx * 7) * w, ship.y * h); ctx.stroke();
    ctx.restore();
    for (const escort of ship.escorts) { if (escort.destroyed) { const blast = Math.max(0, escort.explosion ?? 0); if (blast > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = blast * .45 * fade; ctx.fillStyle = '#ffb36b'; ctx.shadowBlur = 10; ctx.shadowColor = '#ff6b4a'; ctx.beginPath(); ctx.arc(escort.x * w, escort.y * h, ship.size * w * (.9 - blast * .25), 0, Math.PI * 2); ctx.fill(); ctx.restore(); } continue; } const escortSize = ship.size * .42; ctx.save(); ctx.globalAlpha = .18 * fade; if (!drawShipSprite(ctx, escort.x * w, escort.y * h, escortSize, Math.floor(ship.life * 9 + escort.phase) + 12, '#8affff', ship.angle, state.sprite, state.spriteReady)) drawProceduralShip(ctx, escort.x * w, escort.y * h, escortSize, ship.angle, '#b8efff', '#8affff'); ctx.restore(); }
    for (const foe of ship.threats) { const fx = foe.x * w, fy = foe.y * h, fr = Math.max(1.5, ship.size * w * .22), attack = Math.max(0, 1 - foe.cooldown / 1.1); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .45 * fade; ctx.fillStyle = '#ff557d'; ctx.shadowBlur = 6; ctx.shadowColor = '#ff557d'; ctx.beginPath(); ctx.arc(fx, fy, fr, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = .2 * fade; ctx.strokeStyle = '#ff9ab0'; ctx.lineWidth = Math.max(1, w * .001); ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(ship.x * w, ship.y * h); ctx.stroke(); if (attack > .85) { ctx.globalAlpha = .65 * fade; ctx.fillStyle = '#ffd1dd'; ctx.beginPath(); ctx.arc(fx + (ship.x - foe.x) * w * .22, fy + (ship.y - foe.y) * h * .22, Math.max(1, fr * .45), 0, Math.PI * 2); ctx.fill(); } ctx.restore(); }
  }
  for (const cloud of state.backgroundClouds) { const pulse = 1 + Math.sin(t * 1.4 + cloud.seed) * .08; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .09; const g = ctx.createRadialGradient(cloud.x * w, cloud.y * h, 0, cloud.x * w, cloud.y * h, cloud.radius * w * pulse); g.addColorStop(0, cloud.seed % 3 === 0 ? '#a67cff' : cloud.seed % 3 === 1 ? '#4de1ff' : '#ff6bd6'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect((cloud.x - cloud.radius) * w, (cloud.y - cloud.radius) * h, cloud.radius * 2 * w, cloud.radius * 2 * h); ctx.restore(); }
  for (let layer = 0; layer < 3; layer++) { const par = FX_LAYER_PARAS[layer], mul = FX_LAYER_MULTS[layer], alpha = FX_LAYER_ALPHAS[layer], cnt = FX_LAYER_COUNTS[layer], colStr = FX_STAR_COLORS[layer], bright = par === .08, ss = par === .08 ? 2.4 : par === .045 ? 1.6 : 1; for (let i = 0; i < cnt; i++) { const sx = ((i * 61.8 + 37) % 101) / 100 * w, sy = (((i * 137.3 + 13) % 97) / 100 * h + t * mul) % h; const tw = .5 + .5 * Math.sin(t * (1 + par * 140) + i * 3.3); ctx.globalAlpha = alpha * (.35 + .55 * tw); ctx.fillStyle = bright && Math.abs(tw) > .82 ? '#eaf6ff' : colStr; ctx.fillRect(sx, sy, ss, ss); } } ctx.globalAlpha = 1; ctx.fillStyle = bgVignette; ctx.fillRect(0, 0, w, h); for (const b of state.bugs) drawBug(ctx, b.x * w, b.y * h, b.size * w, b, state.frameDetail); for (const c of state.clouds) { const a = Math.max(0, c.life / c.maxLife), r = Math.max(2, c.radius * w), pulse = 1 + .08 * Math.sin(t * 5 + c.x * 17); ctx.save(); ctx.translate(c.x * w, c.y * h); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .12 * a; const g = ctx.createRadialGradient(0, 0, r * .08, 0, 0, r * pulse); g.addColorStop(0, 'rgba(232,255,166,.95)'); g.addColorStop(.25, 'rgba(182,255,77,.7)'); g.addColorStop(.68, 'rgba(73,174,55,.28)'); g.addColorStop(1, 'rgba(20,70,35,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * pulse, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = .42 * a; ctx.strokeStyle = '#b6ff4d'; ctx.lineWidth = Math.max(1.5, w * .003); ctx.setLineDash([r * .12, r * .08]); ctx.beginPath(); ctx.arc(0, 0, r * (.72 + .08 * Math.sin(t * 3 + c.y * 11)), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = .55 * a; ctx.strokeStyle = '#7dff5d'; ctx.lineWidth = Math.max(1, w * .002); for (let q = 0; q < 3; q++) { const ang = t * (.7 + q * .16) + q * 2.1 + c.x * 9; ctx.beginPath(); ctx.arc(Math.cos(ang) * r * .42, Math.sin(ang) * r * .42, r * .16, ang - .9, ang + .9); ctx.stroke(); } ctx.restore(); } ctx.globalAlpha = 1; for (const e of state.effects) { const a = Math.max(0, e.life / e.maxLife); if (e.kind === 'beam') { const x1 = e.x * w, y1 = e.y * h, x2 = (e.x2 ?? e.x) * w, y2 = (e.y2 ?? e.y) * h; const dx = x2 - x1, dy = y2 - y1, beamLength = Math.hypot(dx, dy); if (beamLength > 0.5) { const ux = dx / beamLength, uy = dy / beamLength, thickness = Math.max(1, Math.min(3.5, Math.min(w, h) * 0.0042)); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.globalAlpha = a * .42; ctx.strokeStyle = '#7cf7ff'; ctx.lineWidth = thickness * 3.5; ctx.shadowBlur = 10; ctx.shadowColor = '#7cf7ff'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.globalAlpha = a * .9; ctx.shadowBlur = 0; ctx.strokeStyle = '#7cf7ff'; ctx.lineWidth = thickness * 1.45; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.globalAlpha = a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(.8, thickness * .48); ctx.beginPath(); ctx.moveTo(x1 + ux * thickness * .5, y1 + uy * thickness * .5); ctx.lineTo(x2 - ux * thickness * .5, y2 - uy * thickness * .5); ctx.stroke(); ctx.restore(); } continue; } if (e.kind === 'ring') { const p = 1 - Math.max(0, e.life / e.maxLife); const R = Math.max(1, (e.len || .1) * w * (.3 + .7 * p)); ctx.save(); ctx.globalAlpha = Math.max(0, e.life / e.maxLife); ctx.strokeStyle = e.color; ctx.lineWidth = Math.max(1.5, w * .006 * (1 - p) + 1); ctx.beginPath(); ctx.arc(e.x * w, e.y * h, R, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = Math.max(0, e.life / e.maxLife) * .3; ctx.fillStyle = e.color; ctx.beginPath(); ctx.arc(e.x * w, e.y * h, R, 0, Math.PI * 2); ctx.fill(); ctx.restore(); continue; } if (e.kind === 'edge') { const L = Math.max(0, e.len! * (.25 + .75 * a)) * w; ctx.save(); ctx.translate(e.x * w, e.y * h); ctx.rotate(e.angle! + e.spin! * (e.maxLife - e.life)); ctx.globalAlpha = Math.min(1, a * 1.6); ctx.strokeStyle = e.color; if (state.frameDetail > 0) { ctx.shadowBlur = 8; ctx.shadowColor = e.color; } ctx.lineWidth = Math.max(1, w * .003); ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.lineTo(L / 2, 0); ctx.stroke(); ctx.restore(); continue; } ctx.globalAlpha = a; ctx.fillStyle = e.color; ctx.beginPath(); ctx.arc(e.x * w, e.y * h, Math.max(1, e.size * w * a), 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1; for (const s of state.shots) { if (s.kind === 'missile') { drawMissile(ctx, s, w, h); continue; } if (s.kind === 'plasma') { drawPlasma(ctx, s, w, h); continue; } if (s.kind === 'chem') { drawChem(ctx, s, w, h); continue; } if (s.kind === 'flamer') { drawFlamer(ctx, s, w, h); continue; } if (s.kind === 'flak') { drawFlak(ctx, s, w, h); continue; } if (s.kind === 'rail') { drawRail(ctx, s, w, h); continue; } if (s.kind === 'drone') { drawDroneBolt(ctx, s, w, h); continue; } if (s.kind === 'laser') { drawLaser(ctx, s, w, h); continue; } ctx.fillStyle = s.kind === 'boss' ? '#ff4f9a' : s.kind === 'drone' ? '#7dff9a' : '#7cf7ff'; ctx.beginPath(); ctx.arc(s.x * w, s.y * h, Math.max(2, s.radius * w), 0, Math.PI * 2); ctx.fill(); } drawShip(ctx, state.player.x * w, state.player.y * h, Math.min(w, h) * .042, state.sprite, state.spriteReady, state.shieldVisible, state.shieldRepulse, state.shieldRadius); drawDrones(ctx, w, h, state.orbitDrones, state.sprite, state.spriteReady);
}
export function drawShip(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, sprite: HTMLImageElement | undefined, spriteReady: boolean, shieldVisible: boolean, shieldRepulse: boolean, shieldRadius: number) {
  const frame = Math.floor(performance.now() / 140) % 4 + 12;
  if (drawShipSprite(ctx, x, y, z, frame, '#55dfff', 0, sprite, spriteReady)) { drawShield(ctx, x, y, z, shieldVisible, shieldRepulse, shieldRadius); return; }
  drawProceduralShip(ctx, x, y, z);
  if (shieldVisible) { ctx.save(); ctx.strokeStyle = '#55eaff'; ctx.shadowBlur = 18; ctx.shadowColor = '#55eaff'; ctx.lineWidth = Math.max(2, z * .045); ctx.beginPath(); ctx.arc(x, y, z * (1.45 + shieldRadius * 4), 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
}
export function drawRail(ctx: CanvasRenderingContext2D, s: SpaceProjectile, w: number, h: number) { const px = s.x * w, py = s.y * h, ang = Math.atan2(s.vy, s.vx), r = Math.max(4, s.radius * w); ctx.save(); ctx.translate(px, py); ctx.rotate(ang); ctx.shadowBlur = 20; ctx.shadowColor = '#e0ff70'; ctx.fillStyle = 'rgba(224,255,112,.3)'; ctx.beginPath(); ctx.ellipse(0, 0, r * 3.2, r * .5, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#eefdb0'; ctx.beginPath(); ctx.ellipse(r * .4, 0, r * 2.2, r * .3, 0, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(r * .6, 0, r * 1.4, r * .14, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(224,255,112,.9)'; ctx.lineWidth = Math.max(1, r * .16); for (let i = 0; i < 2; i++) { const bx = -r * 1.2 + Math.random() * r * 3, bl = r * (.5 + Math.random() * .5), up = Math.random() < .5 ? -1 : 1; ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx + r * .25, up * bl); ctx.lineTo(bx + r * .5, 0); ctx.stroke(); } ctx.restore(); }
export function drawDroneBolt(ctx: CanvasRenderingContext2D, s: SpaceProjectile, w: number, h: number) {
  const px = s.x * w, py = s.y * h, ang = Math.atan2(s.vy, s.vx), r = Math.max(3, s.radius * w);
  ctx.save(); ctx.translate(px, py); ctx.rotate(ang);
  ctx.shadowBlur = 8; ctx.shadowColor = '#7dff9a';
  ctx.fillStyle = 'rgba(125,255,154,.35)'; ctx.beginPath(); ctx.arc(0, 0, r * 1.1, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = '#7dff9a';
  ctx.beginPath(); ctx.moveTo(r * 1.6, 0); ctx.lineTo(-r * .4, -r * .55); ctx.lineTo(-r * 1.1, 0); ctx.lineTo(-r * .4, r * .55); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#eafff0'; ctx.beginPath(); ctx.arc(r * .35, 0, r * .3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
export function drawLaser(ctx: CanvasRenderingContext2D, s: SpaceProjectile, w: number, h: number) {
  return;
}