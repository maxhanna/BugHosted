import { Injectable, OnDestroy } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject } from 'rxjs';

export interface MarblesPlayer {
  connectionId: string;
  playerName: string;
  playerId: number;
  ready: boolean;
  sent: number;
  isHost: boolean;
  isBot: boolean;
  alive: boolean;
  /** Multiplayer matches this player left mid-game (forfeit count). */
  forfeits?: number;
}

export interface MarblesLobbyState {
  code: string;
  hostConnectionId: string;
  status: 'lobby' | 'playing';
  /** True when this is a public room anyone can find and join (1:1). */
  isPublic: boolean;
  players: MarblesPlayer[];
}

/** A public room waiting for a challenger, as shown in the open-room list. */
export interface MarblesPublicRoom {
  code: string;
  hostName: string;
  players: number;
  status: string;
}

export interface MarblesOpponentView {
  connectionId: string;
  playerName: string;
  board: number[][];
  specialColor: number;
  reserve: number;
  sent: number;
  alive: boolean;
  isBot: boolean;
  /** Cells that popped on this opponent's board this turn (for animation). */
  popped: { row: number; col: number; color: number }[];
  /** Non-zero when the opponent rotated the pitch row this turn. */
  rowShifted: number;
  /** True when this opponent's update was triggered by a marble drop. */
  dropped: boolean;
  /** Which side the dropped marble entered its column: 0 = top, 1 = bottom. */
  dropSide?: number;
  /** Marbles rained onto this opponent's board this turn. */
  rained: number;
}

export interface MarblesJoinResult extends MarblesLobbyState {
  /** Set when the join was rejected (e.g. a full public room). */
  error?: string;
  myBoard: number[][];
  mySpecialColor: number;
  myReserve: number;
  mySent: number;
  myScore: number;
  opponents: MarblesOpponentView[];
}

export interface MarblesBoardUpdate {
  board: number[][];
  specialColor: number;
  reserve: number;
  sent: number;
  /** Marbles cleared this game (single-player high scores). */
  score: number;
  /** Cells that popped this turn (for pop animation + sound). */
  popped: { row: number; col: number; color: number }[];
  /** How many marbles rained onto this board from an opponent. */
  rained: number;
  /** True when this update was triggered by a marble drop. */
  dropped: boolean;
  /** Which side the dropped marble entered its column: 0 = top, 1 = bottom. */
  dropSide?: number;
  /** Non-zero when the pitch row was rotated this turn (marble slides along it are legit). */
  rowShifted?: number;
  alive: boolean;
  winnerName: string | null;
  /** Other players' live boards (for the side-by-side / corner view). */
  opponents: MarblesOpponentView[];
}

export interface MarblesGameStarted {
  players: MarblesPlayer[];
}

@Injectable({ providedIn: 'root' })
export class MarblesHubService implements OnDestroy {
  private hub: signalR.HubConnection | null = null;

  readonly lobbyState$ = new Subject<MarblesLobbyState>();
  readonly playerJoined$ = new Subject<{ connectionId: string; playerName: string }>();
  readonly playerLeft$ = new Subject<{ connectionId: string; playerName: string }>();
  readonly gameStarted$ = new Subject<MarblesGameStarted>();
  readonly boardUpdate$ = new Subject<MarblesBoardUpdate>();
  readonly gameWon$ = new Subject<{ winnerName: string }>();
  readonly chatMessage$ = new Subject<{ playerName: string; message: string }>();
  readonly connectionError$ = new Subject<string>();
  /** Smoothed round-trip latency + jitter (ms), refreshed by a periodic ping. */
  readonly connectionHealth$ = new Subject<{ latency: number; jitter: number; connected: boolean }>();

  get myConnectionId(): string | null { return this.hub?.connectionId ?? null; }
  get connected(): boolean { return this.hub?.state === signalR.HubConnectionState.Connected; }

  private _pingTimer: ReturnType<typeof setInterval> | null = null;
  private _pingInFlight = false;
  private _latency = 0;
  private _jitter = 0;

  async connect(): Promise<boolean> {
    if (this.connected) return true;
    try {
      this.hub = new signalR.HubConnectionBuilder()
        .withUrl('/hubs/marbles')
        .withAutomaticReconnect([0, 1000, 2000, 5000, 10000])
        .configureLogging(signalR.LogLevel.Warning)
        .build();

      this.hub.on('OnLobbyState', (data: MarblesLobbyState) => this.lobbyState$.next(data));
      this.hub.on('OnPlayerJoined', (data: { connectionId: string; playerName: string }) => this.playerJoined$.next(data));
      this.hub.on('OnPlayerLeft', (data: { connectionId: string; playerName: string }) => this.playerLeft$.next(data));
      this.hub.on('OnGameStarted', (data: MarblesGameStarted) => this.gameStarted$.next(data));
      this.hub.on('OnBoardUpdate', (data: MarblesBoardUpdate) => this.boardUpdate$.next(data));
      this.hub.on('OnGameWon', (data: { winnerName: string }) => this.gameWon$.next(data));
      this.hub.on('OnChatMessage', (data: { playerName: string; message: string }) => this.chatMessage$.next(data));

      this.hub.onreconnecting(() => this.connectionError$.next('Reconnecting...'));
      this.hub.onclose(() => this.connectionError$.next('Disconnected'));

      await this.hub.start();
      this.startPingLoop();
      return true;
    } catch (err) {
      console.error('MarblesHub connection failed:', err);
      this.connectionError$.next('Connection failed');
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.stopPingLoop();
    if (!this.hub) return;
    try { await this.hub.stop(); } catch { /* ignore */ }
    this.hub = null;
  }

  /** Measure one round trip to the hub, returning the latency in ms (or null
   *  when disconnected/unreachable). */
  private async measurePing(): Promise<number | null> {
    if (!this.connected || !this.hub) return null;
    const t0 = performance.now();
    try {
      await this.hub.invoke('Ping');
      return performance.now() - t0;
    } catch {
      return null;
    }
  }

  /** Poll the hub every few seconds and publish smoothed latency + jitter.
   *  Latency is an exponential moving average of the RTT; jitter is the
   *  smoothed average deviation from it, so bursts of noise don't flicker the
   *  indicator. */
  private startPingLoop(): void {
    if (this._pingTimer) return;
    const tick = async () => {
      if (this._pingInFlight) return;
      this._pingInFlight = true;
      const rtt = await this.measurePing();
      this._pingInFlight = false;
      if (rtt == null) {
        this._latency = 0;
        this._jitter = 0;
        this.connectionHealth$.next({ latency: 0, jitter: 0, connected: false });
        return;
      }
      if (this._latency === 0) {
        this._latency = rtt;
      } else {
        this._jitter = this._jitter * 0.7 + Math.abs(rtt - this._latency) * 0.3;
        this._latency = this._latency * 0.6 + rtt * 0.4;
      }
      this.connectionHealth$.next({ latency: Math.round(this._latency), jitter: Math.round(this._jitter), connected: true });
    };
    void tick();
    this._pingTimer = setInterval(() => void tick(), 3000);
  }

  private stopPingLoop(): void {
    if (this._pingTimer) { clearInterval(this._pingTimer); this._pingTimer = null; }
    this._latency = 0;
    this._jitter = 0;
  }

  async joinLobby(code: string, playerName: string, playerId: number, isPublic = false): Promise<MarblesJoinResult | null> {
    try {
      if (!this.connected) await this.connect();
      return await this.hub!.invoke<MarblesJoinResult>('JoinLobby', code, playerName, playerId, isPublic);
    } catch (err) {
      console.error('JoinLobby failed:', err);
      return null;
    }
  }

  /** Fetch the list of open public rooms (1:1 matches waiting for a challenger). */
  async listPublicRooms(): Promise<MarblesPublicRoom[] | null> {
    try {
      if (!this.connected) await this.connect();
      const res = await this.hub!.invoke<{ rooms: MarblesPublicRoom[] }>('ListPublicRooms');
      return res?.rooms ?? [];
    } catch (err) {
      console.error('ListPublicRooms failed:', err);
      return null;
    }
  }

  async leaveLobby(code: string): Promise<void> {
    if (!this.connected) return;
    try { await this.hub!.invoke('LeaveLobby', code); } catch { /* ignore */ }
  }

  async toggleReady(code: string): Promise<void> {
    if (!this.connected) return;
    try { await this.hub!.invoke('ToggleReady', code); } catch { /* ignore */ }
  }

  async startGame(code: string): Promise<void> {
    if (!this.connected) return;
    try { await this.hub!.invoke('StartGame', code); } catch { /* ignore */ }
  }

  /** Start a single-player game vs the computer. Difficulty: 0 easy, 1 medium, 2 hard. */
  async startVsAI(code: string, difficulty: number): Promise<void> {
    if (!this.connected) return;
    try { await this.hub!.invoke('StartVsAI', code, difficulty); } catch { /* ignore */ }
  }

  /** Freeze the match while the in-game menu is open (stops drops + AI). */
  async pauseGame(code: string): Promise<void> {
    if (!this.connected) return;
    try { await this.hub!.invoke('PauseGame', code); } catch { /* ignore */ }
  }

  /** Unfreeze the match when the in-game menu closes. */
  async resumeGame(code: string): Promise<void> {
    if (!this.connected) return;
    try { await this.hub!.invoke('ResumeGame', code); } catch { /* ignore */ }
  }

  /** Shift the center row: -1 = left, +1 = right (marbles wrap around). */
  async shiftRow(code: string, dir: number): Promise<void> {
    if (!this.connected) return;
    try { await this.hub!.invoke('ShiftRow', code, dir); } catch { /* ignore */ }
  }

  /** Shift a column: -1 = up, +1 = down (marbles cycle through the column). */
  async shiftColumn(code: string, col: number, dir: number): Promise<void> {
    if (!this.connected) return;
    try { await this.hub!.invoke('ShiftColumn', code, col, dir); } catch { /* ignore */ }
  }

  async sendChat(code: string, message: string): Promise<void> {
    if (!this.connected) return;
    try { await this.hub!.invoke('SendChat', code, message); } catch { /* ignore */ }
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
