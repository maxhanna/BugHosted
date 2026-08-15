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
  /** True when this update was triggered by a marble drop from the top. */
  dropped: boolean;
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

  get myConnectionId(): string | null { return this.hub?.connectionId ?? null; }
  get connected(): boolean { return this.hub?.state === signalR.HubConnectionState.Connected; }

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
      return true;
    } catch (err) {
      console.error('MarblesHub connection failed:', err);
      this.connectionError$.next('Connection failed');
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.hub) return;
    try { await this.hub.stop(); } catch { /* ignore */ }
    this.hub = null;
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
