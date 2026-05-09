import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface TileCacheResponse {
  imageData?: string;
}

@Injectable({
  providedIn: 'root'
})
export class TileCacheService {
  private readonly API_URL = '/api/TileCache';

  constructor(private http: HttpClient) {}

  getTile(z: number, x: number, y: number): Observable<TileCacheResponse> {
    return this.http.get<TileCacheResponse>(`${this.API_URL}?z=${z}&x=${x}&y=${y}`);
  }

  saveTile(z: number, x: number, y: number, imageData: string): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(this.API_URL, { z, x, y, imageData });
  }
}