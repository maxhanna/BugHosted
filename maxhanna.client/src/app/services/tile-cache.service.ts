import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, interval } from 'rxjs';
import { takeUntil, shareReplay } from 'rxjs/operators';

export interface TileCacheResponse {
  imageData?: string;
  z?: number;
  x?: number;
  y?: number;
}

export interface TileBatchRequest {
  tiles: Array<{ z: number; x: number; y: number; imageData?: string }>;
}

interface PendingTileRequest {
  z: number;
  x: number;
  y: number;
  callbacks: Array<(response: TileCacheResponse | null) => void>;
}

@Injectable({
  providedIn: 'root'
})
export class TileCacheService {
  private readonly API_URL = '/tilecache';
  private readonly BATCH_SIZE = 10;
  private readonly BATCH_INTERVAL = 5000; // 5 seconds
  private readonly GET_BATCH_INTERVAL = 500; // 500ms for gets
  private readonly MAX_MEMORY_CACHE_SIZE = 200; // Limit to prevent memory bloat

  private tileQueue: Array<{ z: number; x: number; y: number; imageData: string }> = [];
  private batchSubject = new Subject<void>();
  private getQueue: Map<string, PendingTileRequest> = new Map();
  private getBatchSubject = new Subject<void>();
  private memoryCache: Map<string, TileCacheResponse> = new Map(); // In-memory cache to avoid re-fetching
  private cacheOrder: string[] = []; // Track insertion order for eviction
  private pendingObservables: Map<string, Observable<TileCacheResponse>> = new Map(); // Cache Observable to avoid duplicate requests
  private getBatchInFlight = false;

  constructor(private http: HttpClient) {
    // Start batch processing for saves
    interval(this.BATCH_INTERVAL).pipe(
      takeUntil(this.batchSubject)
    ).subscribe(() => this.processBatch());
  }

  getTile(z: number, x: number, y: number): Observable<TileCacheResponse> {
    const key = `${z}/${x}/${y}`;

    // Check memory cache first - return immediately
    const cached = this.memoryCache.get(key);
    if (cached && cached.imageData) {
      return new Observable(observer => {
        observer.next(cached);
        observer.complete();
      });
    }

    // Return existing pending Observable if already in flight
    const existing = this.pendingObservables.get(key);
    if (existing) {
      return existing;
    }

    // Create new Observable and cache it
    const observable = new Observable<TileCacheResponse>(observer => {
      console.log(`TileCacheService getTile: ${key}, queue size: ${this.getQueue.size}, inFlight: ${this.getBatchInFlight}`);
      const pending = this.getQueue.get(key);
      if (pending) {
        pending.callbacks.push((response) => {
          if (response && response.imageData) {
            observer.next(response);
            observer.complete();
          } else {
            observer.error(null);
          }
        });
        return;
      }

      this.getQueue.set(key, {
        z, x, y,
        callbacks: [(response) => {
          if (response && response.imageData) {
            observer.next(response);
            observer.complete();
          } else {
            observer.error(null);
          }
        }]
      });

      // Trigger batch fetch immediately instead of polling
      this.processGetBatch();
    }).pipe(
      shareReplay(1)
    );

    this.pendingObservables.set(key, observable);
    return observable;
  }

  private processGetBatch(): void {
    console.log(`processGetBatch: queue size=${this.getQueue.size}, inFlight=${this.getBatchInFlight}`);
    if (this.getQueue.size === 0 || this.getBatchInFlight) return;

    this.getBatchInFlight = true;

    const tilesToGet: Array<{ z: number; x: number; y: number }> = [];

    this.getQueue.forEach((request, key) => {
      tilesToGet.push({ z: request.z, x: request.x, y: request.y });
    });

    console.log(`Sending getbatch request with ${tilesToGet.length} tiles`);
    const batchRequest: TileBatchRequest = { tiles: tilesToGet };

    this.http.post<TileCacheResponse[]>(`${this.API_URL}/getbatch`, batchRequest).subscribe({
      next: (responses) => {
        this.getBatchInFlight = false;
        responses.forEach(response => {
          const key = `${response.z}/${response.x}/${response.y}`;
          if (response.imageData) {
            if (!this.memoryCache.has(key)) {
              this.cacheOrder.push(key);
            }
            this.memoryCache.set(key, response);
            while (this.cacheOrder.length > this.MAX_MEMORY_CACHE_SIZE) {
              const oldestKey = this.cacheOrder.shift();
              if (oldestKey) {
                this.memoryCache.delete(oldestKey);
              }
            }
          }
          const pending = this.getQueue.get(key);
          if (pending) {
            pending.callbacks.forEach(cb => cb(response));
            this.getQueue.delete(key);
          }
          this.pendingObservables.delete(key);
        });
        // If more tiles were added while request was in flight, fetch them too
        if (this.getQueue.size > 0) {
          setTimeout(() => this.processGetBatch(), 0);
        }
      },
      error: () => {
        this.getBatchInFlight = false;
        this.getQueue.forEach((pending, key) => {
          pending.callbacks.forEach(cb => cb(null));
          this.pendingObservables.delete(key);
        });
        this.getQueue.clear();
      }
    });
  }

  saveTile(z: number, x: number, y: number, imageData: string): void {
    this.tileQueue.push({ z, x, y, imageData });
    if (this.tileQueue.length >= this.BATCH_SIZE) {
      this.processBatch();
    }
  }

  private processBatch(): void {
    if (this.tileQueue.length === 0) return;

    const tilesToSave = this.tileQueue.splice(0, this.BATCH_SIZE);
    const batchRequest: TileBatchRequest = { tiles: tilesToSave };

    this.http.post(`${this.API_URL}/batch`, batchRequest).subscribe({
      next: () => {},
      error: () => {} // Silently fail
    });
  }

  ngOnDestroy(): void {
    // Process remaining tiles on destroy
    this.processBatch();
    this.batchSubject.next();
    this.batchSubject.complete();
    this.getBatchSubject.next();
    this.getBatchSubject.complete();
  }
}