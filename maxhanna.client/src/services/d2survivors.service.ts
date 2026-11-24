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
  /** False for the snapshot sent when a run starts, true once it ends. */
  completed?: boolean;
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

export interface D2ProgressData {
  exists: boolean;
  payload?: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class D2SurvivorsService implements OnDestroy {
  private lobbyHub: signalR.HubConnection | null = null;
  private lobbyConnectPromise: Promise<boolean> | null = null;
  private lobbyReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lobbyRetryDelayMs = 1000;
  // Bumped whenever the lobby connection is intentionally dropped so a start()
  // that was already in flight cannot resurrect it or queue another retry.
  private lobbyGeneration = 0;
  readonly lobbyMessage$ = new Subject<D2LobbyMessage>();
  readonly leaderboardUpdated$ = new Subject<void>();

  connectLobby(): Promise<boolean> {
    if (this.lobbyHub?.state === signalR.HubConnectionState.Connected) return Promise.resolve(true);
    // The menu can request the lobby while ngOnInit's first connection is still
    // negotiating. Reuse that attempt: stopping the hub here would abort its
    // WebSocket handshake ("closed before receiving a handshake response").
    if (this.lobbyConnectPromise) return this.lobbyConnectPromise;
    const attempt = this.startLobbyConnection();
    this.lobbyConnectPromise = attempt;
    const clearAttempt = () => {
      if (this.lobbyConnectPromise === attempt) this.lobbyConnectPromise = null;
    };
    void attempt.then(clearAttempt, clearAttempt);
    return attempt;
  }

  private async startLobbyConnection(): Promise<boolean> {
    this.clearLobbyReconnect();
    const generation = ++this.lobbyGeneration;
    const previous = this.lobbyHub;
    this.lobbyHub = null;
    if (previous) {
      try { await previous.stop(); } catch { }
      if (generation !== this.lobbyGeneration) return false;
    }

    const hub = new signalR.HubConnectionBuilder()
      .withUrl('/hubs/d2-survivors-lobby')
      .withAutomaticReconnect([0, 1000, 2000, 5000, 10000])
      .configureLogging(signalR.LogLevel.Warning)
      .build();
    this.lobbyHub = hub;
    hub.on('OnLobbyMessage', (message: D2LobbyMessage) => this.lobbyMessage$.next(message));
    hub.on('OnLeaderboardUpdated', () => this.leaderboardUpdated$.next());
    hub.onclose(() => {
      // Ignore closes from a hub we replaced or intentionally stopped.
      if (this.lobbyHub !== hub) return;
      this.lobbyHub = null;
      this.scheduleLobbyReconnect();
    });

    try {
      await hub.start();
      if (generation !== this.lobbyGeneration) {
        this.lobbyHub = null;
        try { await hub.stop(); } catch { }
        return false;
      }
      this.lobbyRetryDelayMs = 1000;
      return true;
    } catch (error) {
      console.error('D2 Survivors lobby connection failed', error);
      if (this.lobbyHub === hub) {
        this.lobbyHub = null;
        this.scheduleLobbyReconnect();
      }
      return false;
    }
  }

  private scheduleLobbyReconnect(): void {
    if (this.lobbyReconnectTimer !== null) return;
    const delay = this.lobbyRetryDelayMs;
    this.lobbyRetryDelayMs = Math.min(delay * 2, 30000);
    this.lobbyReconnectTimer = setTimeout(() => {
      this.lobbyReconnectTimer = null;
      void this.connectLobby();
    }, delay);
  }

  private clearLobbyReconnect(): void {
    if (this.lobbyReconnectTimer === null) return;
    clearTimeout(this.lobbyReconnectTimer);
    this.lobbyReconnectTimer = null;
  }

  async disconnectLobby(): Promise<void> {
    this.lobbyGeneration += 1;
    this.clearLobbyReconnect();
    this.lobbyRetryDelayMs = 1000;
    const hub = this.lobbyHub;
    this.lobbyHub = null;
    if (!hub) return;
    try { await hub.stop(); } catch { }
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

  /** Whole-character progress for the signed-in account (gold, gear, stash,
   *  per-class profiles and any run in flight). */
  getProgress(userId: number, sessionToken: string) {
    return this.post<D2ProgressData>('/d2survivors/getprogress', { userId }, sessionToken);
  }

  saveProgress(userId: number, payload: string, sessionToken: string, keepalive = false) {
    return this.post<unknown>('/d2survivors/saveprogress', { userId, payload }, sessionToken, keepalive);
  }

  getSave(userId: number, sessionToken: string) {
    return this.post<D2SaveData>('/d2survivors/getsave', { userId }, sessionToken);
  }

  save(request: D2SaveRequest, sessionToken: string, keepalive = false) {
    return this.post<unknown>('/d2survivors/save', request, sessionToken, keepalive);
  }

  /** Activity heartbeat so a live run shows in Currently Playing. */
  touchActivity(userId: number, sessionToken: string) {
    return this.post<{ ok: boolean }>('/d2survivors/touch', { userId }, sessionToken);
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
