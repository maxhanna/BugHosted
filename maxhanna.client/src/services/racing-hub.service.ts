import { Injectable, OnDestroy } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject } from 'rxjs';

/** Garage appearance synced between players so remote cars match what was
 *  equipped: paint skin + part ids + neon glow. */
export interface RacingCarAppearancePayload {
  skinId: number;
  spoilerId?: number;
  rimId?: number;
  exhaustId?: number;
  decalId?: number;
  decalColorId?: number;
  glowId?: number;
  accentId?: number;
  glowIntensity?: number;
}

export interface LobbyPlayer extends RacingCarAppearancePayload {
  connectionId: string;
  playerName: string;
  playerId: number;
  isHost: boolean;
  ready: boolean;
  skinId: number;
  // True when this member is already racing in another lobby ("🏁 IN RACE").
  inRace?: boolean;
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

/** One row of the menu's live per-track lobby snapshot (ListLobbies). */
export interface RacingLobbySummary {
  trackId: string;
  players: number;
  status: string;
}

/** One AI driver's state, relayed from the authoritative bot simulator (the
 *  lobby host) so every client renders the same bots in the same places. */
export interface BotPositionPayload {
  i: number;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  dist: number;
  raceDist: number;
  lap: number;
  alive: boolean;
  slide: number;
  brakeCommitment: number;
  crashTimer: number;
  rimBumpTimer: number;
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
  // Total length of the circuit (0 until the track is loaded). The server
  // uses it to track cumulative distance and derive laps/positions itself.
  totalTrackDist?: number;
  // Cumulative wrap-aware race distance (negative while a grid-staggered
  // starter is still behind the line). Lets receivers rank remotes correctly
  // from the flag drop instead of from the wrapped per-frame distance.
  raceDist?: number;
}

export interface RaceGridSlot {
  connectionId: string;
  playerId: number;
  playerName: string;
  slot: number;
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

// The winner of a just-finished multiplayer race, broadcast with the final
// standings so every client celebrates the same winner at the same moment.
export interface RaceWinner {
  connectionId: string;
  playerName: string;
  playerId: number;
}

@Injectable({ providedIn: 'root' })
export class RacingHubService implements OnDestroy {
  private hub: signalR.HubConnection | null = null;

  readonly lobbyState$ = new Subject<LobbyState>();
  // Patch updates for an existing roster row's "in another race" flag.
  readonly rosterUpdate$ = new Subject<{ connectionId: string; inRace: boolean }>();
  readonly playerJoined$ = new Subject<LobbyPlayer>();
  readonly playerLeft$ = new Subject<string>();
  readonly playerReadyChanged$ = new Subject<{ connectionId: string; ready: boolean }>();
  readonly playerSkinChanged$ = new Subject<{ connectionId: string; skinId: number }>();
  /** Full garage appearance changed (paint + parts + glow) for a roster member. */
  readonly playerAppearanceChanged$ = new Subject<{ connectionId: string } & RacingCarAppearancePayload>();
  readonly raceCountdown$ = new Subject<number>();
  readonly raceStarted$ = new Subject<{ startTime: number; totalLaps: number; grid?: RaceGridSlot[] }>();
  readonly carPositionUpdate$ = new Subject<RemoteCarPosition>();
  /** AI drivers relayed from the authoritative simulator (the lobby host). */
  readonly botPositionUpdate$ = new Subject<{ connectionId: string; bots: BotPositionPayload[] }>();
  readonly playerFinished$ = new Subject<PlayerFinishedEvent>();
  readonly raceStandings$ = new Subject<RaceStandingsRow[]>();
  /** Winner of the just-finished race (null when nobody finished). */
  readonly raceWinner$ = new Subject<RaceWinner | null>();
  /** Milliseconds left in the standings display window (live countdown source). */
  readonly standingsWindowMs$ = new Subject<number>();
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

      this.hub.on('OnLobbyRosterUpdate', (data: { connectionId: string; inRace: boolean }) => {
        this.rosterUpdate$.next(data);
      });

      this.hub.on('OnPlayerReadyChanged', (data: { connectionId: string; ready: boolean }) => {
        this.playerReadyChanged$.next(data);
      });

      this.hub.on('OnPlayerSkinChanged', (data: { connectionId: string; skinId: number }) => {
        this.playerSkinChanged$.next(data);
      });

      this.hub.on('OnPlayerAppearanceChanged', (data: { connectionId: string } & RacingCarAppearancePayload) => {
        this.playerAppearanceChanged$.next(data);
      });

      this.hub.on('OnRaceCountdown', (count: number) => {
        this.raceCountdown$.next(count);
      });

      this.hub.on('OnRaceStarted', (data: { startTime: number; totalLaps: number; grid?: RaceGridSlot[] }) => {
        this.raceStarted$.next(data);
      });

      this.hub.on('OnCarPositionUpdate', (data: RemoteCarPosition) => {
        this.carPositionUpdate$.next(data);
      });

      this.hub.on('OnBotPositionUpdate', (data: { connectionId: string; bots: BotPositionPayload[] }) => {
        this.botPositionUpdate$.next(data);
      });

      this.hub.on('OnPlayerFinished', (data: PlayerFinishedEvent) => {
        this.playerFinished$.next(data);
      });

      this.hub.on('OnRaceStandings', (data: { standings: RaceStandingsRow[]; remainingMs?: number; winner?: RaceWinner | null }) => {
        this.raceStandings$.next(data.standings || []);
        this.standingsWindowMs$.next(data.remainingMs ?? 0);
        this.raceWinner$.next(data.winner ?? null);
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

  async joinLobby(trackId: string, playerName: string, playerId: number, laps = 3, totalTrackDist = 0, upgradeLevel = 0, appearance?: RacingCarAppearancePayload): Promise<LobbyState | null> {
    try {
      if (!this.connected) await this.connect();
      return await this.hub!.invoke<LobbyState>('JoinLobby', trackId, playerName, playerId, laps, totalTrackDist, upgradeLevel, appearance);
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

  /** Fetch how many players are waiting in each track's lobby (menu badge). */
  async listLobbies(): Promise<RacingLobbySummary[] | null> {
    try {
      if (!this.connected) return null;
      const res = await this.hub!.invoke<{ lobbies: RacingLobbySummary[] }>('ListLobbies');
      return res?.lobbies ?? [];
    } catch (err) {
      console.error('ListLobbies failed:', err);
      return null;
    }
  }

  async toggleReady(trackId: string): Promise<void> {
    if (!this.connected) return;
    try { await this.hub!.invoke('ToggleReady', trackId); } catch { }
  }

  async updateSkin(trackId: string, skinId: number): Promise<void> {
    if (!this.connected) return;
    try { await this.hub!.invoke('UpdateSkin', trackId, skinId); } catch { }
  }

  /** Broadcast the caller's full garage appearance to the lobby. */
  async updateCarAppearance(trackId: string, appearance: RacingCarAppearancePayload): Promise<void> {
    if (!this.connected) return;
    try { await this.hub!.invoke('UpdateCarAppearance', trackId, appearance); } catch { }
  }

  async startRace(trackId: string, laps = 3, totalTrackDist = 0): Promise<void> {
    if (!this.connected) return;
    try { await this.hub!.invoke('StartRace', trackId, laps, totalTrackDist); } catch { }
  }

  async rematch(trackId: string): Promise<void> {
    if (!this.connected) return;
    try { await this.hub!.invoke('Rematch', trackId); } catch { }
  }

  async syncPosition(trackId: string, data: RemoteCarPosition): Promise<void> {
    if (!this.connected) return;
    try { await this.hub!.invoke('SyncPosition', trackId, data); } catch { }
  }

  /** Publish the authoritative AI-driver states (host only; server relays them). */
  async syncBotPositions(trackId: string, bots: BotPositionPayload[]): Promise<void> {
    if (!this.connected) return;
    try { await this.hub!.invoke('SyncBotPositions', trackId, bots); } catch { }
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
