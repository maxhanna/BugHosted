import { Injectable, OnDestroy } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject } from 'rxjs';

export interface MarblesPlayer {
  connectionId: string;
  playerName: string;
  playerId: number;
  ready: boolean;
  score: number;
  isHost: boolean;
}

export interface MarblesLobbyState {
  code: string;
  hostConnectionId: string;
  status: 'lobby' | 'playing';
  targetScore: number;
  players: MarblesPlayer[];
}

export interface MarblesJoinResult extends MarblesLobbyState {
  myBoard: number[][];
  myScore: number;
}

export interface MarblesBoardUpdate {
  valid: boolean;
  board: number[][];
  score: number;
  gained: number;
}

export interface MarblesGameStarted {
  targetScore: number;
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
  readonly scoreUpdate$ = new Subject<MarblesPlayer>();
  readonly gameWon$ = new Subject<MarblesPlayer>();
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
      this.hub.on('OnScoreUpdate', (data: MarblesPlayer) => this.scoreUpdate$.next(data));
      this.hub.on('OnGameWon', (data: MarblesPlayer) => this.gameWon$.next(data));
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

  async swap(code: string, r1: number, c1: number, r2: number, c2: number): Promise<MarblesBoardUpdate | null> {
    if (!this.connected) return null;
    try {
      return await this.hub!.invoke<MarblesBoardUpdate>('Swap', code, r1, c1, r2, c2);
    } catch (err) {
      console.error('Swap failed:', err);
      return null;
    }
  }

  async sendChat(code: string, message: string): Promise<void> {
    if (!this.connected) return;
    try { await this.hub!.invoke('SendChat', code, message); } catch { /* ignore */ }
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
