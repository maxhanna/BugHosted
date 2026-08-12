import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RaceResult, RacingPlayerCar, RaceState, TrackDefinition } from './datacontracts/racing/racing-types';

@Injectable({
  providedIn: 'root'
})
export class RacingService {
  private baseUrl = '/racing';

  constructor(private http: HttpClient) { }

  // Live count of players connected to racing lobbies (navigation icon badge).
  async getActivePlayers(signal?: AbortSignal): Promise<number | null> {
    try {
      const response = await fetch(`${this.baseUrl}/activeplayers`, { signal });
      if (!response.ok) return null;
      const data: any = await response.json();
      return data?.count ?? null;
    } catch (e) {
      console.error('Error fetching active racing players', e);
      return null;
    }
  }

  async getPlayerCar(userId: number): Promise<RacingPlayerCar | null> {
    try {
      return await this.http.get<RacingPlayerCar>(`${this.baseUrl}/car/${userId}`).toPromise() ?? null;
    } catch { return null; }
  }

  // Friends' per-track best laps for the RECORDS 'vs friends' toggle.
  async getFriendRecords(userId: number): Promise<{ userId: number; playerName: string; bestLapsByTrack: Record<number, number> }[]> {
    try {
      return await this.http.get<any[]>(`${this.baseUrl}/friends/${userId}`).toPromise() ?? [];
    } catch { return []; }
  }

  async savePlayerCar(car: RacingPlayerCar): Promise<boolean> {
    try {
      await this.http.post(`${this.baseUrl}/car/save`, car).toPromise();
      return true;
    } catch { return false; }
  }

  async buyUpgrade(userId: number, upgradeId: number): Promise<RacingPlayerCar | null> {
    try {
      return await this.http.post<RacingPlayerCar>(`${this.baseUrl}/car/upgrade`, { userId, upgradeId }).toPromise() ?? null;
    } catch { return null; }
  }

  async buySkin(userId: number, skinId: number): Promise<RacingPlayerCar | null> {
    try {
      return await this.http.post<RacingPlayerCar>(`${this.baseUrl}/car/skin`, { userId, skinId }).toPromise() ?? null;
    } catch { return null; }
  }

  async submitRaceResult(userId: number, result: RaceResult): Promise<any> {
    try {
      return await this.http.post(`${this.baseUrl}/race/result`, { userId, result }).toPromise();
    } catch { return null; }
  }

  async getRaceState(raceId: number): Promise<RaceState | null> {
    try {
      return await this.http.get<RaceState>(`${this.baseUrl}/race/${raceId}`).toPromise() ?? null;
    } catch { return null; }
  }

  async getLeaderboard(trackId: number, userId: number = 0): Promise<{ results: RaceResult[]; totalCount: number; userRank: number; bestLap: number }> {
    try {
      const data: any = await this.http.get(`${this.baseUrl}/leaderboard/${trackId}?userId=${userId}`).toPromise();
      if (Array.isArray(data)) return { results: data, totalCount: data.length, userRank: 0, bestLap: 0 };
      return {
        results: data?.results ?? [],
        totalCount: data?.totalCount ?? 0,
        userRank: data?.userRank ?? 0,
        bestLap: data?.bestLap ?? 0,
      };
    } catch { return { results: [], totalCount: 0, userRank: 0, bestLap: 0 }; }
  }

  // Per-circuit breakdown for the Best Laps panel — every track's top laps by
  // players plus the caller's own best lap and rank on each circuit.
  // Returns null when the response doesn't look like the expected shape (e.g. a
  // test/mock backend returning {} for this route) so the panel can tell the
  // user the data is unavailable instead of implying no laps exist.
  async getAllTrackLeaderboards(userId: number = 0): Promise<{
    tracks: {
      trackId: number;
      totalCount: number;
      bestLap: number;
      userLap: number;
      userRank: number;
      results: RaceResult[];
    }[];
  } | null> {
    try {
      const data: any = await this.http.get(`${this.baseUrl}/leaderboard-by-track?userId=${userId}`).toPromise();
      if (data === null || typeof data !== 'object' || !Array.isArray(data.tracks)) {
        return null;
      }
      return { tracks: data.tracks };
    } catch { return null; }
  }

  // High-scores view across ALL circuits — every player's fastest lap anywhere,
  // the circuit it was set on, and their per-track breakdown.
  // Returns null when the response doesn't look like the expected shape (or the
  // route is missing) so the panel can say data is unavailable instead of
  // implying nobody has raced.
  async getOverallLeaderboard(userId: number = 0): Promise<{
    results: (RaceResult & { bestLapsByTrack?: { [trackId: number]: number } })[],
    totalCount: number;
    userRank: number;
    bestLap: number;
  } | null> {
    try {
      const data: any = await this.http.get(`${this.baseUrl}/leaderboard-overall?userId=${userId}`).toPromise();
      if (data === null || typeof data !== 'object' || !Array.isArray(data.results)) {
        return null;
      }
      return {
        results: data.results ?? [],
        totalCount: data.totalCount ?? 0,
        userRank: data.userRank ?? 0,
        bestLap: data.bestLap ?? 0,
      };
    } catch { return null; }
  }

  async joinRace(userId: number, trackId: number): Promise<any> {
    try {
      return await this.http.post(`${this.baseUrl}/race/join`, { userId, trackId }).toPromise();
    } catch { return null; }
  }

  async getTracks(): Promise<TrackDefinition[]> {
    try {
      return await this.http.get<TrackDefinition[]>(`${this.baseUrl}/tracks`).toPromise() ?? [];
    } catch { return []; }
  }
}
