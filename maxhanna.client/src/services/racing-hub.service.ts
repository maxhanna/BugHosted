import { Injectable, OnDestroy } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject } from 'rxjs';

export interface LobbyPlayer {
  connectionId: string;
  playerName: string;
  playerId: number;
  isHost: boolean;
  ready: boolean;
  skinId: number;
}

export interface LobbyState {
  lobbyId: string;
  trackId: string;
  players: LobbyPlayer[];
  isHost: boolean;
  // Seconds left before the lobby auto-starts (0 when no timer is running).
  // Sent in the JoinLobby response so every player — host or not — can show
  // the "Auto-start in 2:00" banner immediately on joining.
  autoStartRemaining?: number;
}

export interface RemoteCarPosition {
  connectionId: string;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  distance: number;
  currentLap: number;
  isOffTrack: boolean;
}

export interface PlayerFinishedEvent {
  connectionId: string;
  playerName: string;
  position: number;
  totalTimeMs: number;
}

// One row of the authoritative lobby-wide final classification, broadcast by
// the server once every player has crossed the line.
export interface RaceStandingsRow {
  connectionId: string;
  playerName: string;
  playerId: number;
  position: number;
  totalTimeMs: number;
  laps: number;
  isDnf?: boolean;
}

export interface ChatMessage {
  playerName: string;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class RacingHubService implements OnDestroy {
  private hub: signalR.HubConnection | null = null;

  readonly lobbyState$ = new Subject<LobbyState>();
  readonly playerJoined$ = new Subject<LobbyPlayer>();
  readonly playerLeft$ = new Subject<string>();
  readonly playerReadyChanged$ = new Subject<{ connectionId: string; ready: boolean }>();
  readonly playerSkinChanged$ = new Subject<{ connectionId: string; skinId: number }>();
  readonly raceCountdown$ = new Subject<number>();
  readonly raceStarted$ = new Subject<{ startTime: number; totalLaps: number }>();
  readonly carPositionUpdate$ = new Subject<RemoteCarPosition>();
  readonly playerFinished$ = new Subject<PlayerFinishedEvent>();
  readonly raceStandings$ = new Subject<RaceStandingsRow[]>();
  readonly chatMessage$ = new Subject<ChatMessage>();
  readonly madeHost$ = new Subject<void>();
  readonly hostChanged$ = new Subject<{ connectionId: string }>();
  readonly rematch$ = new Subject<LobbyPlayer[]>();
  readonly autoStartCountdown$ = new Subject<number>();
  readonly connectionError$ = new Subject<string>();

  get myConnectionId(): string | null { return this.hub?.connectionId ?? null; }
  get connected(): boolean {
    return this.hub?.state === signalR.HubConnectionState.Connected;
  }

  async connect(): Promise<boolean> {
    if (this.connected) return true;

    try {
      this.hub = new signalR.HubConnectionBuilder()
        .withUrl('/hubs/racing')
        .withAutomaticReconnect([0, 1000, 2000, 5000, 10000])
        .configureLogging(signalR.LogLevel.Warning)
        .build();

      // ── Register handlers ──

      this.hub.on('OnPlayerJoined', (data: LobbyPlayer) => {
        this.playerJoined$.next(data);
      });

      this.hub.on('OnPlayerLeft', (playerName: string) => {
        this.playerLeft$.next(playerName);
      });

      this.hub.on('OnPlayerReadyChanged', (data: { connectionId: string; ready: boolean }) => {
        this.playerReadyChanged$.next(data);
      });

      this.hub.on('OnPlayerSkinChanged', (data: { connectionId: string; skinId: number }) => {
        this.playerSkinChanged$.next(data);
      });

      this.hub.on('OnRaceCountdown', (count: number) => {
        this.raceCountdown$.next(count);
      });

      this.hub.on('OnRaceStarted', (data: { startTime: number; totalLaps: number }) => {
        this.raceStarted$.next(data);
      });

      this.hub.on('OnCarPositionUpdate', (data: RemoteCarPosition) => {
        this.carPositionUpdate$.next(data);
      });

      this.hub.on('OnPlayerFinished', (data: PlayerFinishedEvent) => {
        this.playerFinished$.next(data);
      });

      this.hub.on('OnRaceStandings', (data: { standings: RaceStandingsRow[] }) => {
        this.raceStandings$.next(data.standings || []);
      });

      this.hub.on('OnChatMessage', (data: ChatMessage) => {
        this.chatMessage$.next(data);
      });

      this.hub.on('OnMadeHost', () => {
        this.madeHost$.next();
      });

      this.hub.on('OnPlayerHostChanged', (data: { connectionId: string }) => {
        this.hostChanged$.next(data);
      });

      this.hub.on('OnRematch', (data: { players: LobbyPlayer[] }) => {
        this.rematch$.next(data.players || []);
      });

      this.hub.on('OnAutoStartCountdown', (remaining: number) => {
        this.autoStartCountdown$.next(remaining);
      });

      this.hub.onreconnecting(() => {
        this.connectionError$.next('Reconnecting...');
      });

      this.hub.onclose(() => {
        this.connectionError$.next('Disconnected');
      });

      await this.hub.start();
      return true;
    } catch (err) {
      console.error('RacingHub connection failed:', err);
      this.connectionError$.next('Connection failed');
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.hub) return;
    try { await this.hub.stop(); } catch { }
    this.hub = null;
  }

  async joinLobby(trackId: string, playerName: string, playerId: number, laps = 3): Promise<LobbyState | null> {
    try {
      if (!this.connected) await this.connect();
      return await this.hub!.invoke<LobbyState>('JoinLobby', trackId, playerName, playerId, laps);
    } catch (err) {
      console.error('JoinLobby failed:', err);
      return null;
    }
  }

  async leaveLobby(trackId: string): Promise<void> {
    try {
      if (!this.connected) return;
      await this.hub!.invoke('LeaveLobby', trackId);
    } catch { }
  }

  async toggleReady(trackId: string): Promise<void> {
    if (!this.connected) return;
    try { await this.hub!.invoke('ToggleReady', trackId); } catch { }
  }

  async updateSkin(trackId: string, skinId: number): Promise<void> {
    if (!this.connected) return;
    try { await this.hub!.invoke('UpdateSkin', trackId, skinId); } catch { }
  }

  async startRace(trackId: string, laps = 3): Promise<void> {
    if (!this.connected) return;
    try { await this.hub!.invoke('StartRace', trackId, laps); } catch { }
  }

  async rematch(trackId: string): Promise<void> {
    if (!this.connected) return;
    try { await this.hub!.invoke('Rematch', trackId); } catch { }
  }

  async syncPosition(trackId: string, data: RemoteCarPosition): Promise<void> {
    if (!this.connected) return;
    try { await this.hub!.invoke('SyncPosition', trackId, data); } catch { }
  }

  async finishRace(trackId: string, position: number, totalTimeMs: number, laps = 0): Promise<void> {
    if (!this.connected) return;
    try { await this.hub!.invoke('FinishRace', trackId, position, totalTimeMs, laps); } catch { }
  }

  async sendChat(trackId: string, message: string): Promise<void> {
    if (!this.connected) return;
    try { await this.hub!.invoke('SendChat', trackId, message); } catch { }
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
