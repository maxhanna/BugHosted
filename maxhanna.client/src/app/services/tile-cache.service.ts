import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

export interface TileCacheResponse {
  imageData?: string;
}

export interface TileBatchRequest {
  tiles: Array<{ z: number; x: number; y: number; imageData: string }>;
}

@Injectable({
  providedIn: 'root'
})
export class TileCacheService {
  private readonly API_URL = '/api/TileCache';
  private readonly BATCH_SIZE = 10;
  private readonly BATCH_INTERVAL = 5000; // 5 seconds

  private tileQueue: Array<{ z: number; x: number; y: number; imageData: string }> = [];
  private batchSubject = new Subject<void>();

  constructor(private http: HttpClient) {
    // Start batch processing
    interval(this.BATCH_INTERVAL).pipe(
      takeUntil(this.batchSubject)
    ).subscribe(() => this.processBatch());
  }

  getTile(z: number, x: number, y: number): Observable<TileCacheResponse> {
    return this.http.get<TileCacheResponse>(`${this.API_URL}?z=${z}&x=${x}&y=${y}`);
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
  }
}