import { Chunk, generateChunk } from './digcraft-world';
import { CHUNK_SIZE } from './digcraft-types';
import { DigCraftRenderer } from './digcraft-renderer';

// Minimal binary min-heap for prioritized generation
interface HeapNode { cx: number; cz: number; dist2: number; }
class MinHeap {
  private data: HeapNode[] = [];
  get size(): number { return this.data.length; }
  push(node: HeapNode): void { this.data.push(node); this._bubbleUp(this.data.length - 1); }
  pop(): HeapNode | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) { this.data[0] = last; this._sinkDown(0); }
    return top;
  }
  clear(): void { this.data = []; }
  private _bubbleUp(i: number): void { while (i > 0) { const p = (i - 1) >> 1; if (this.data[p].dist2 <= this.data[i].dist2) break; [this.data[p], this.data[i]] = [this.data[i], this.data[p]]; i = p; } }
  private _sinkDown(i: number): void { const n = this.data.length; while (true) { let smallest = i; const l = (i << 1) + 1, r = l + 1; if (l < n && this.data[l].dist2 < this.data[smallest].dist2) smallest = l; if (r < n && this.data[r].dist2 < this.data[smallest].dist2) smallest = r; if (smallest === i) break; [this.data[smallest], this.data[i]] = [this.data[i], this.data[smallest]]; i = smallest; } }
}

class RebuildQueue {
  private pending: Map<string, number> = new Map();
  private dirty = false;
  private sorted: string[] = [];
  add(key: string, dist2: number): void { const existing = this.pending.get(key); if (existing === undefined || dist2 < existing) { this.pending.set(key, dist2); this.dirty = true; } }
  delete(key: string): void { if (this.pending.has(key)) { this.pending.delete(key); this.dirty = true; } }
  has(key: string): boolean { return this.pending.has(key); }
  clear(): void { this.pending.clear(); this.sorted = []; this.dirty = false; }
  sortedKeys(): readonly string[] { if (this.dirty) { this.sorted = [...this.pending.keys()].sort((a, b) => this.pending.get(a)! - this.pending.get(b)!); this.dirty = false; } return this.sorted; }
  popBatch(max: number, budgetMs: number, startTime: number): string[] { const keys = this.sortedKeys(); const result: string[] = []; for (let i = 0; i < keys.length && result.length < max; i++) { if (performance.now() - startTime >= budgetMs) break; result.push(keys[i]); } for (const k of result) this.delete(k); return result; }
}

type SeqMap = Map<string, number>;
interface WorkerSlot { worker: Worker; inflight: number; }

class MeshWorkerPool {
  private slots: WorkerSlot[] = [];
  private rr = 0;
  private seq: SeqMap = new Map();
  private inFlight: Set<string> = new Set();

  constructor(private readonly workerCount: number, private readonly onResult: (msg: any) => void, private readonly onError: (msg: any) => void) {}

  private ensureInit(): void {
    if (this.slots.length > 0) return;
    for (let i = 0; i < this.workerCount; i++) {
      try {
        const worker = new Worker(new URL('./digcraft-mesh.worker', import.meta.url), { type: 'module' });
        worker.addEventListener('message', (ev: MessageEvent) => {
          const msg = ev.data as any;
          if (!msg) return;
          if (msg.type === 'result') {
            const slot = this.slots.find(s => s.worker === worker);
            if (slot) slot.inflight = Math.max(0, slot.inflight - 1);
            this.inFlight.delete(msg.key);
            const currentSeq = this.seq.get(msg.key) ?? 0;
            if ((msg.seq ?? 0) < currentSeq) return;
            this.onResult(msg);
          } else if (msg.type === 'error') {
            this.onError(msg);
          }
        });
        this.slots.push({ worker, inflight: 0 });
      } catch (err) {
        console.warn('[ChunkLoader] worker init failed', err);
      }
    }
  }

  post(key: string, payload: object, transfer: ArrayBufferLike[]): boolean {
    this.ensureInit();
    if (this.slots.length === 0) return false;
    let best = 0;
    for (let i = 1; i < this.slots.length; i++) if (this.slots[i].inflight < this.slots[best].inflight) best = i;
    const nextSeq = (this.seq.get(key) ?? 0) + 1;
    this.seq.set(key, nextSeq);
    this.inFlight.add(key);
    try {
      this.slots[best].worker.postMessage({ ...payload, seq: nextSeq }, transfer);
      this.slots[best].inflight++;
      return true;
    } catch (e) {
      this.inFlight.delete(key);
      console.warn('[ChunkLoader] worker postMessage failed', e);
      return false;
    }
  }

  isInFlight(key: string): boolean { return this.inFlight.has(key); }
  cancel(key: string): void { this.seq.set(key, (this.seq.get(key) ?? 0) + 1); this.inFlight.delete(key); }
  dispose(): void { for (const s of this.slots) { try { s.worker.terminate(); } catch { } } this.slots = []; this.seq.clear(); this.inFlight.clear(); }
}

export interface ChunkLoaderOptions {
  chunks: Map<string, Chunk>;
  renderer: DigCraftRenderer;
  seed: number;
  isMobile: () => boolean;
  getViewDistance: () => number;
  worldId: () => number;
  fetchChunkChanges: (cx: number, cz: number, chunk: Chunk) => Promise<void>;
  workerCount?: number;
}

export class ChunkLoader {
  private chunks: Map<string, Chunk>;
  private renderer: DigCraftRenderer;
  private opts: ChunkLoaderOptions;
  private genQueue = new MinHeap();
  private genQueued = new Set<string>();
  private rebuildQueue = new RebuildQueue();
  private workerPool: MeshWorkerPool;
  private lastCX = Infinity;
  private lastCZ = Infinity;
  private needsReload = false;
  private loadingInProgress = false;

  constructor(opts: ChunkLoaderOptions) {
    this.opts = opts;
    this.chunks = opts.chunks;
    this.renderer = opts.renderer;
    const mobile = opts.isMobile();
    const hwCores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : 4;
    const defaultWorkers = mobile ? 2 : Math.min(4, Math.max(2, hwCores - 1));
    const workerCount = opts.workerCount ?? defaultWorkers;
    this.workerPool = new MeshWorkerPool(workerCount, (msg) => this._onWorkerResult(msg), (msg) => console.warn('[ChunkLoader] worker error:', msg.message));
  }

  tick(camCX: number, camCZ: number, inBurst: boolean): void {
    const mobile = this.opts.isMobile();
    const budgetMs = inBurst ? (mobile ? 40 : 60) : (mobile ? 12 : 8);
    const tickStart = performance.now();
    if (camCX !== this.lastCX || camCZ !== this.lastCZ) {
      const movedDist = Math.abs(camCX - this.lastCX) + Math.abs(camCZ - this.lastCZ);
      this.lastCX = camCX; this.lastCZ = camCZ;
      if (movedDist > 2) this._flushStaleWork(camCX, camCZ);
      this.needsReload = true;
    }
    if (this.needsReload && !this.loadingInProgress) { this.needsReload = false; this._loadChunksAround(camCX, camCZ).catch(() => {}); }
    const maxGen = inBurst ? 12 : 3; let genDone = 0;
    while (this.genQueue.size > 0 && genDone < maxGen && (performance.now() - tickStart) < budgetMs) {
      const node = this.genQueue.pop(); if (!node) break; const { cx, cz } = node; const key = `${cx},${cz}`; this.genQueued.delete(key);
      if (!this._isInView(cx, cz, camCX, camCZ)) continue; if (this.chunks.has(key)) continue;
      const chunk = generateChunk(this.opts.seed, cx, cz, !this.opts.isMobile()); this.chunks.set(key, chunk); this.opts.fetchChunkChanges(cx, cz, chunk).catch(() => {});
      const d2 = (cx - camCX) ** 2 + (cz - camCZ) ** 2; this.rebuildQueue.add(key, d2); genDone++;
    }
    const maxRebuilds = inBurst ? 16 : 4; const rebuildKeys = this.rebuildQueue.popBatch(maxRebuilds, budgetMs, tickStart);
    for (const key of rebuildKeys) { const [cx, cz] = key.split(',').map(Number); if (Math.abs(cx - camCX) > this.opts.getViewDistance() + 1 || Math.abs(cz - camCZ) > this.opts.getViewDistance() + 1) continue; this._sendMeshBuild(cx, cz); }
  }

  requestLoadAround(cx: number, cz: number): void { this.lastCX = Infinity; this.needsReload = true; }
  markRebuild(cx: number, cz: number): void { const camCX = this.lastCX; const camCZ = this.lastCZ; const d2 = (cx - camCX) ** 2 + (cz - camCZ) ** 2; this.rebuildQueue.add(`${cx},${cz}`, d2); }
  markRebuildBoundary(cx: number, cz: number, localX: number, localZ: number): void { this.markRebuild(cx, cz); if (localX === 0) this.markRebuild(cx - 1, cz); if (localX === CHUNK_SIZE - 1) this.markRebuild(cx + 1, cz); if (localZ === 0) this.markRebuild(cx, cz - 1); if (localZ === CHUNK_SIZE - 1) this.markRebuild(cx, cz + 1); }
  onTeleport(newCX: number, newCZ: number): void { this._flushStaleWork(newCX, newCZ); this.lastCX = Infinity; this.needsReload = true; }

  dispose(): void { this.genQueue.clear(); this.genQueued.clear(); this.rebuildQueue.clear(); this.workerPool.dispose(); this.loadingInProgress = false; this.needsReload = false; }

  public async loadAround(ccx: number, ccz: number): Promise<void> { await this._loadChunksAround(ccx, ccz); }

  private async _loadChunksAround(ccx: number, ccz: number): Promise<void> {
    if (this.loadingInProgress) { this.needsReload = true; return; }
    this.loadingInProgress = true;
    try {
      const viewDist = this.opts.getViewDistance(); const mobile = this.opts.isMobile(); const evictDist = viewDist + 2;
      const needed = new Set<string>(); const nearBatch: Array<[number, number]> = []; const NEAR_DIST2 = (2.5) ** 2;
      for (let dx = -viewDist; dx <= viewDist; dx++) for (let dz = -viewDist; dz <= viewDist; dz++) { const cx = ccx + dx; const cz = ccz + dz; const key = `${cx},${cz}`; needed.add(key); if (this.chunks.has(key)) continue; const d2 = dx * dx + dz * dz; if (d2 <= NEAR_DIST2) nearBatch.push([cx, cz]); else if (!this.genQueued.has(key)) { this.genQueued.add(key); this.genQueue.push({ cx, cz, dist2: d2 }); } }
      const fetchPromises: Promise<void>[] = [];
      for (const [cx, cz] of nearBatch) { const key = `${cx},${cz}`; if (this.chunks.has(key)) continue; const chunk = generateChunk(this.opts.seed, cx, cz, !mobile); this.chunks.set(key, chunk); this.genQueued.delete(key); const d2 = (cx - ccx) ** 2 + (cz - ccz) ** 2; this.rebuildQueue.add(key, d2); fetchPromises.push(this.opts.fetchChunkChanges(cx, cz, chunk)); }
      if (fetchPromises.length > 0) { if (mobile) { for (let i = 0; i < fetchPromises.length; i += 3) await Promise.allSettled(fetchPromises.slice(i, i + 3)); } else { await Promise.allSettled(fetchPromises); } }
      for (const key of needed) { if (this.chunks.has(key) && !(this.renderer as any).meshes?.has(key) && !this.rebuildQueue.has(key)) { const [cx, cz] = key.split(',').map(Number); const d2 = (cx - ccx) ** 2 + (cz - ccz) ** 2; this.rebuildQueue.add(key, d2); } }
      for (const key of Array.from(this.chunks.keys())) { if (needed.has(key)) continue; const [cx, cz] = key.split(',').map(Number); if (Math.abs(cx - ccx) <= evictDist && Math.abs(cz - ccz) <= evictDist) continue; try { this.renderer.freeChunkMesh(key); } catch { } this.chunks.delete(key); this.rebuildQueue.delete(key); this.workerPool.cancel(key); }
      for (const key of [...this.genQueued]) { const [cx, cz] = key.split(',').map(Number); if (Math.abs(cx - ccx) > evictDist || Math.abs(cz - ccz) > evictDist) { this.genQueued.delete(key); this.workerPool.cancel(key); } }
    } finally { this.loadingInProgress = false; }
  }

  private _flushStaleWork(newCX: number, newCZ: number): void {
    const viewDist = this.opts.getViewDistance(); const preserved: HeapNode[] = [];
    while (this.genQueue.size > 0) { const node = this.genQueue.pop()!; if (this._isInView(node.cx, node.cz, newCX, newCZ, viewDist)) preserved.push(node); else { this.genQueued.delete(`${node.cx},${node.cz}`); this.workerPool.cancel(`${node.cx},${node.cz}`); } }
    for (const n of preserved) this.genQueue.push(n);
    for (const key of [...this.rebuildQueue.sortedKeys()]) { const [cx, cz] = key.split(',').map(Number); if (!this._isInView(cx, cz, newCX, newCZ, viewDist)) { this.rebuildQueue.delete(key); this.workerPool.cancel(key); } }
  }

  private _isInView(cx: number, cz: number, camCX: number, camCZ: number, viewDist?: number): boolean { const d = viewDist ?? this.opts.getViewDistance(); return Math.abs(cx - camCX) <= d + 1 && Math.abs(cz - camCZ) <= d + 1; }

  private _sendMeshBuild(cx: number, cz: number): void {
    const key = `${cx},${cz}`; const chunk = this.chunks.get(key); if (!chunk) return;
    if (this.workerPool.isInFlight(key)) { const camCX = this.lastCX; const camCZ = this.lastCZ; const d2 = (cx - camCX) ** 2 + (cz - camCZ) ** 2; this.rebuildQueue.add(key, d2); return; }
    const neighborsPayload: Record<string, any> = {}; const transfer: ArrayBufferLike[] = [];
    const blocksCopy = chunk.blocks.slice(); const blockHealthCopy = chunk.blockHealth ? chunk.blockHealth.slice() : new Uint8Array(0); const biomeColumnCopy = chunk.biomeColumn ? chunk.biomeColumn.slice() : new Uint8Array(0); const waterLevelCopy = chunk.waterLevel ? chunk.waterLevel.slice() : null; const fluidIsSourceCopy = chunk.fluidIsSource ? chunk.fluidIsSource.slice() : null;
    transfer.push(blocksCopy.buffer, blockHealthCopy.buffer, biomeColumnCopy.buffer); if (waterLevelCopy) transfer.push(waterLevelCopy.buffer); if (fluidIsSourceCopy) transfer.push(fluidIsSourceCopy.buffer);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { if (dx === 0 && dz === 0) continue; const nkey = `${cx + dx},${cz + dz}`; const nch = this.chunks.get(nkey); if (!nch) continue; const nb = nch.blocks.slice(); transfer.push(nb.buffer); const nd: any = { cx: cx + dx, cz: cz + dz, blocks: nb }; if (nch.biomeColumn) { const nbc = nch.biomeColumn.slice(); nd.biomeColumn = nbc; transfer.push(nbc.buffer); } if (nch.waterLevel) { const nwl = nch.waterLevel.slice(); nd.waterLevel = nwl; transfer.push(nwl.buffer); } if (nch.fluidIsSource) { const nfs = nch.fluidIsSource.slice(); nd.fluidIsSource = nfs; transfer.push(nfs.buffer); } neighborsPayload[nkey] = nd; }
    const lowEndMode = (this.renderer as any).lowEndMode ?? this.opts.isMobile();
    const posted = this.workerPool.post(key, { type: 'build', cx, cz, blocks: blocksCopy, blockHealth: blockHealthCopy, biomeColumn: biomeColumnCopy, waterLevel: waterLevelCopy, fluidIsSource: fluidIsSourceCopy, neighbors: neighborsPayload, lowEndMode }, transfer);
    if (!posted) { try { (this.renderer as any).buildChunkMesh?.(chunk, (wx: number, wy: number, wz: number) => { const ncx = Math.floor(wx / CHUNK_SIZE); const ncz = Math.floor(wz / CHUNK_SIZE); const nd = neighborsPayload[`${ncx},${ncz}`]; if (!nd) return 0; const lx = wx - ncx * CHUNK_SIZE; const lz = wz - ncz * CHUNK_SIZE; return (nd.blocks as Uint8Array)?.[(wy * CHUNK_SIZE + lz) * CHUNK_SIZE + lx] ?? 0; }); } catch (e) { console.warn('[ChunkLoader] sync fallback failed', e); } }
  }

  private _onWorkerResult(msg: any): void {
    try {
      (this.renderer as any)._applyMeshWorkerResult?.(msg);
    } catch {
    }
  }
}

export {};
