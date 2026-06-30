import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

export interface TileCacheResponse {
  imageData?: string;
  z?: number;
  x?: number;
  y?: number;
}

export interface TileBatchRequest {
  tiles: Array<{ z: number; x: number; y: number }>;
}

// A pending fetch: one entry per unique tile key currently being fetched.
// Multiple callers can attach callbacks to the same in-flight request.
interface PendingFetch {
  z: number;
  x: number;
  y: number;
  // Generation at the time this fetch was queued.
  // If the global generation has advanced past this, the result is discarded.
  generation: number;
  callbacks: Array<(img: HTMLImageElement | null) => void>;
}

@Injectable({ providedIn: 'root' })
export class TileCacheService {

  private readonly API_URL = '/tilecache';

  // ---- in-memory image cache ----------------------------------------------
  // Stores decoded HTMLImageElement objects, keyed by "z/x/y".
  // This is separate from the server-side DB cache: once decoded here we
  // never re-fetch from the network for the lifetime of the page.
  private readonly MAX_CACHE = 2048;
  private imageCache = new Map<string, HTMLImageElement>();
  private cacheOrder: string[] = [];  // LRU eviction order

  // ---- fetch queue --------------------------------------------------------
  // Tiles waiting to be sent in the next batch HTTP request.
  private fetchQueue = new Map<string, PendingFetch>();
  // Tiles currently in-flight (HTTP request dispatched, waiting for response).
  private inFlight = new Map<string, PendingFetch>();

  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly BATCH_DEBOUNCE_MS = 60;   // wait this long after the last enqueue before firing
  private readonly MAX_BATCH_SIZE = 48;   // max tiles per HTTP request

  // ---- cancellation -------------------------------------------------------
  // Every time the view changes meaningfully (zoom/pan) the component bumps
  // this counter.  Any queued-but-not-yet-dispatched fetch whose generation
  // is older than the current one gets silently dropped.  In-flight HTTP
  // requests are NOT aborted (too expensive and the server caches them
  // anyway), but their callbacks are ignored if their generation is stale.
  private currentGeneration = 0;

  // ---- save queue ---------------------------------------------------------
  // (unchanged from original — batch-saves decoded tiles to the server DB)
  private saveQueue: Array<{ z: number; x: number; y: number; imageData: string }> = [];
  private readonly SAVE_BATCH_SIZE = 10;
  private readonly SAVE_INTERVAL_MS = 5000;
  private destroy$ = new Subject<void>();

  constructor(private http: HttpClient) {
    // Periodic save flush
    setInterval(() => this.flushSaveQueue(), this.SAVE_INTERVAL_MS);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Bump the cancellation generation.  Call this whenever the view changes
   * enough that previously-queued (not yet dispatched) tiles are no longer
   * useful.  In-flight requests finish but their results are silently dropped
   * if their generation doesn't match.
   */
  cancelPending(): void {
    this.currentGeneration++;
    // Drop every entry from the fetch queue — they haven't been sent yet.
    this.fetchQueue.forEach(pending => {
      pending.callbacks.forEach(cb => cb(null));
    });
    this.fetchQueue.clear();
    if (this.batchTimer !== null) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
  }

  /**
   * Request a tile.  Returns immediately (synchronously) via `cb` if the
   * image is already in the memory cache.  Otherwise enqueues a batch fetch.
   *
   * `cb` is called exactly once, with either the decoded image or null.
   */
  getTile(
    z: number, x: number, y: number,
    cb: (img: HTMLImageElement | null) => void
  ): void {
    const key = `${z}/${x}/${y}`;

    // 1. Already decoded in memory — return synchronously.
    const cached = this.imageCache.get(key);
    if (cached) {
      this.touchCacheKey(key);
      cb(cached);
      return;
    }

    // 2. Already queued or in-flight — attach callback.
    const queued = this.fetchQueue.get(key) ?? this.inFlight.get(key);
    if (queued) {
      queued.callbacks.push(cb);
      return;
    }

    // 3. Enqueue a new fetch.
    this.fetchQueue.set(key, {
      z, x, y,
      generation: this.currentGeneration,
      callbacks: [cb],
    });
    this.scheduleBatch();
  }

  /**
   * Get a cached tile synchronously WITHOUT triggering any fetches.
   * Returns the image if cached, or null if not in cache.
   */
  getCachedTile(key: string): HTMLImageElement | null {
    return this.imageCache.get(key) ?? null;
  }  

  // -------------------------------------------------------------------------
  // Batch fetch machinery
  // -------------------------------------------------------------------------

  private scheduleBatch(): void {
    if (this.batchTimer !== null) return;
    this.batchTimer = setTimeout(() => {
      this.batchTimer = null;
      this.dispatchBatch();
    }, this.BATCH_DEBOUNCE_MS);
  }

  private dispatchBatch(): void {
    if (this.fetchQueue.size === 0) return;

    // Snapshot up to MAX_BATCH_SIZE entries, moving them to inFlight.
    const snapshot: PendingFetch[] = [];
    for (const [key, pending] of this.fetchQueue) {
      if (snapshot.length >= this.MAX_BATCH_SIZE) break;
      snapshot.push(pending);
      this.inFlight.set(key, pending);
      this.fetchQueue.delete(key);
    }

    // If more remain, schedule another batch immediately after this one.
    if (this.fetchQueue.size > 0) this.scheduleBatch();

    const batchGeneration = this.currentGeneration;

    const body: TileBatchRequest = {
      tiles: snapshot.map(p => ({ z: p.z, x: p.x, y: p.y })),
    };

    this.http.post<TileCacheResponse[]>(`${this.API_URL}/getbatch`, body)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: responses => {
          responses.forEach(resp => {
            const key = `${resp.z}/${resp.x}/${resp.y}`;
            const pending = this.inFlight.get(key);
            this.inFlight.delete(key);

            if (!pending) return;

            // If the view has moved on, silently drop — don't draw stale tiles.
            if (pending.generation < batchGeneration - 1) {
              pending.callbacks.forEach(cb => cb(null));
              return;
            }

            if (resp.imageData) {
              this.decodeImage(resp.imageData, key, pending.callbacks);
            } else {
              pending.callbacks.forEach(cb => cb(null));
            }
          });

          // Any pending entries not present in the response (server timeout etc.)
          snapshot.forEach(p => {
            const key = `${p.z}/${p.x}/${p.y}`;
            if (this.inFlight.has(key)) {
              this.inFlight.delete(key);
              p.callbacks.forEach(cb => cb(null));
            }
          });
        },
        error: () => {
          snapshot.forEach(p => {
            const key = `${p.z}/${p.x}/${p.y}`;
            this.inFlight.delete(key);
            p.callbacks.forEach(cb => cb(null));
          });
        },
      });
  }

  private decodeImage(
    dataUrl: string,
    key: string,
    callbacks: Array<(img: HTMLImageElement | null) => void>
  ): void {
    const img = new Image();
    img.onload = () => {
      // Store in LRU cache.
      if (!this.imageCache.has(key)) {
        this.cacheOrder.push(key);
      } else {
        this.touchCacheKey(key);
      }
      this.imageCache.set(key, img);
      while (this.cacheOrder.length > this.MAX_CACHE) {
        const evict = this.cacheOrder.shift()!;
        this.imageCache.delete(evict);
      }
      callbacks.forEach(cb => cb(img));
    };
    img.onerror = () => {
      callbacks.forEach(cb => cb(null));
    };
    img.src = dataUrl;
  }

  private touchCacheKey(key: string): void {
    const index = this.cacheOrder.indexOf(key);
    if (index < 0) return;
    this.cacheOrder.splice(index, 1);
    this.cacheOrder.push(key);
  }

  // -------------------------------------------------------------------------
  // Save queue (unchanged logic, just tidied)
  // -------------------------------------------------------------------------

  saveTile(z: number, x: number, y: number, imageData: string): void {
    this.saveQueue.push({ z, x, y, imageData });
    if (this.saveQueue.length >= this.SAVE_BATCH_SIZE) this.flushSaveQueue();
  }

  private flushSaveQueue(): void {
    if (this.saveQueue.length === 0) return;
    const batch = this.saveQueue.splice(0, this.SAVE_BATCH_SIZE);
    this.http.post(`${this.API_URL}/batch`, { tiles: batch })
      .pipe(takeUntil(this.destroy$))
      .subscribe({ error: () => { } });
  }

  ngOnDestroy(): void {
    this.flushSaveQueue();
    this.destroy$.next();
    this.destroy$.complete();
  }
}
