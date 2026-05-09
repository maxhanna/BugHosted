import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

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

  constructor(private http: HttpClient) {
    // Start batch processing for saves
    interval(this.BATCH_INTERVAL).pipe(
      takeUntil(this.batchSubject)
    ).subscribe(() => this.processBatch());

    // Start batch processing for gets
    interval(this.GET_BATCH_INTERVAL).pipe(
      takeUntil(this.getBatchSubject)
    ).subscribe(() => this.processGetBatch());
  }

  getTile(z: number, x: number, y: number): Observable<TileCacheResponse> {
    return new Observable(observer => {
      const key = `${z}/${x}/${y}`;

      // Check memory cache first
      const cached = this.memoryCache.get(key);
      if (cached && cached.imageData) {
        observer.next(cached);
        observer.complete();
        return;
      }

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
    });
  }

  private processGetBatch(): void {
    if (this.getQueue.size === 0) return;

    const tilesToGet: Array<{ z: number; x: number; y: number }> = [];

    this.getQueue.forEach((request, key) => {
      tilesToGet.push({ z: request.z, x: request.x, y: request.y });
    });

    const batchRequest: TileBatchRequest = { tiles: tilesToGet };

    this.http.post<TileCacheResponse[]>(`${this.API_URL}/getbatch`, batchRequest).subscribe({
      next: (responses) => {
        responses.forEach(response => {
          const key = `${response.z}/${response.x}/${response.y}`;
          if (response.imageData) {
            if (!this.memoryCache.has(key)) {
              this.cacheOrder.push(key);
            }
            this.memoryCache.set(key, response);
            // Evict oldest if over limit
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
        });
      },
      error: () => {
        this.getQueue.forEach((pending, key) => {
          pending.callbacks.forEach(cb => cb(null));
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