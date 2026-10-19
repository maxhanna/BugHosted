import { Injectable, OnDestroy } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject } from 'rxjs';

export interface D2SaveData {
  exists: boolean;
  gold?: number;
  potions?: number;
  inventory?: string;
  equipped?: string;
  runSnapshot?: string | null;
}

export interface D2SaveRequest {
  userId: number;
  gold: number;
  potions: number;
  inventory: string;
  equipped: string;
  runSnapshot: string | null;
}

export interface D2RecordRunRequest {
  userId: number;
  timeSeconds: number;
  kills: number;
  level: number;
  victory: boolean;
}

export interface D2RecordCharacterRequest extends D2RecordRunRequest {
  runId: string;
  characterName: string;
  classId: string;
}

export interface D2LeaderboardEntry {
  id: number;
  userId: number;
  characterName: string;
  classId: string;
  username: string;
  score: number;
  timeSeconds: number;
  kills: number;
  level: number;
  victory: boolean;
  died: boolean;
  createdAt: string;
}

export interface D2LobbyMessage {
  id: number;
  userId: number;
  username: string;
  message: string;
  createdAt: string;
}

export interface D2HighScore {
  id: number;
  userId: number;
  username: string;
  score: number;
  timeSeconds: number;
  kills: number;
  level: number;
  victory: boolean;
  createdAt: string;
}

export interface D2ApiResult<T> {
  ok: boolean;
  data: T | null;
}

@Injectable({
  providedIn: 'root'
})
export class D2SurvivorsService implements OnDestroy {
  private lobbyHub: signalR.HubConnection | null = null;
  readonly lobbyMessage$ = new Subject<D2LobbyMessage>();
  readonly leaderboardUpdated$ = new Subject<void>();

  async connectLobby(): Promise<boolean> {
    if (this.lobbyHub?.state === signalR.HubConnectionState.Connected) return true;
    try {
      if (this.lobbyHub) await this.lobbyHub.stop();
      this.lobbyHub = new signalR.HubConnectionBuilder()
        .withUrl('/hubs/d2-survivors-lobby')
        .withAutomaticReconnect([0, 1000, 2000, 5000, 10000])
        .configureLogging(signalR.LogLevel.Warning)
        .build();
      this.lobbyHub.on('OnLobbyMessage', (message: D2LobbyMessage) => this.lobbyMessage$.next(message));
      this.lobbyHub.on('OnLeaderboardUpdated', () => this.leaderboardUpdated$.next());
      await this.lobbyHub.start();
      return true;
    } catch (error) {
      console.error('D2 Survivors lobby connection failed', error);
      return false;
    }
  }

  async disconnectLobby(): Promise<void> {
    if (!this.lobbyHub) return;
    try { await this.lobbyHub.stop(); } catch { }
    this.lobbyHub = null;
  }

  ngOnDestroy(): void {
    void this.disconnectLobby();
  }

  private async post<T>(url: string, body: unknown, sessionToken?: string, keepalive = false): Promise<D2ApiResult<T>> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers['Encrypted-UserId'] = sessionToken;
      const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), keepalive });
      if (!response.ok) return { ok: false, data: null };
      const text = await response.text();
      return { ok: true, data: text ? (JSON.parse(text) as T) : null };
    } catch (error) {
      console.error(`D2 Survivors request failed: ${url}`, error);
      return { ok: false, data: null };
    }
  }

  getSave(userId: number, sessionToken: string) {
    return this.post<D2SaveData>('/d2survivors/getsave', { userId }, sessionToken);
  }

  save(request: D2SaveRequest, sessionToken: string, keepalive = false) {
    return this.post<unknown>('/d2survivors/save', request, sessionToken, keepalive);
  }

  recordRun(request: D2RecordRunRequest, sessionToken: string) {
    return this.post<{ score: number }>('/d2survivors/recordrun', request, sessionToken);
  }

  getHighScores(limit = 10) {
    return this.post<D2HighScore[]>('/d2survivors/highscores', limit);
  }

  recordCharacter(request: D2RecordCharacterRequest, sessionToken: string) {
    return this.post<{ score: number }>('/d2survivors/recordcharacter', request, sessionToken);
  }

  getLeaderboard(limit = 12) {
    return this.post<D2LeaderboardEntry[]>('/d2survivors/leaderboard', limit);
  }

  getLobbyHistory(limit = 60) {
    return this.post<D2LobbyMessage[]>('/d2survivors/lobbyhistory', limit);
  }

  sendLobbyMessage(userId: number, message: string, sessionToken: string) {
    return this.post<D2LobbyMessage>('/d2survivors/lobbymessage', { userId, message }, sessionToken);
  }
}
