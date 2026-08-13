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
  alive: boolean;
  heights: number[];
}

export interface MarblesLobbyState {
  code: string;
  hostConnectionId: string;
  status: 'lobby' | 'playing';
  players: MarblesPlayer[];
}

export interface MarblesJoinResult extends MarblesLobbyState {
  myBoard: number[][];
  myCurrentColor: number;
  mySent: number;
}

export interface MarblesBoardUpdate {
  board: number[][];
  currentColor: number;
  sent: number;
  /** Cells that popped this turn (for pop animation + sound). */
  popped: { row: number; col: number; color: number }[];
  /** How many marbles rained onto this board from an opponent. */
  rained: number;
  /** True when this update is the result of my own drop. */
  dropped: boolean;
  alive: boolean;
  winnerName: string | null;
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

  async joinLobby(code: string, playerName: string, playerId: number): Promise<MarblesJoinResult | null> {
    try {
      if (!this.connected) await this.connect();
      return await this.hub!.invoke<MarblesJoinResult>('JoinLobby', code, playerName, playerId);
    } catch (err) {
      console.error('JoinLobby failed:', err);
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

  /** Drop your current marble into a column (0..5). */
  async drop(code: string, col: number): Promise<void> {
    if (!this.connected) return;
    try { await this.hub!.invoke('Drop', code, col); } catch { /* ignore */ }
  }

  async sendChat(code: string, message: string): Promise<void> {
    if (!this.connected) return;
    try { await this.hub!.invoke('SendChat', code, message); } catch { /* ignore */ }
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
