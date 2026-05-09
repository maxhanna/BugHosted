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

  private tileQueue: Array<{ z: number; x: number; y: number; imageData: string }> = [];
  private batchSubject = new Subject<void>();
  private getQueue: Map<string, PendingTileRequest> = new Map();
  private getBatchSubject = new Subject<void>();

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