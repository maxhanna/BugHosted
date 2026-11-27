import { Injectable, OnDestroy } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject } from 'rxjs';

/** One hero standing in a zone, as the other players see them. */
export interface CoopPlayerState {
  connectionId: string;
  name: string;
  classId: string;
  level: number;
  x: number;
  y: number;
  facingX: number;
  facingY: number;
  hpFraction: number;
  /** The hero's current clip, so a guest can pose the other player. */
  animation: string;
  sentAt: number;
}

/** A monster the zone's host has placed; guests build the same one. */
export interface CoopMonsterSpawn {
  id: number;
  kind: 'normal' | 'champion' | 'boss';
  species: string;
  championType?: string | null;
  level: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  name: string;
  elite: boolean;
}

export interface CoopMonsterState {
  id: number;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  animation: string;
}

/** An item lying on the shared zone floor. */
export interface CoopLootAdd {
  itemId: string;
  /** The item as the client serialises it, so a drop arrives whole. */
  itemJson: string;
  x: number;
  y: number;
}

export interface CoopZoneSnapshot {
  zone: string;
  hostConnectionId: string;
  connectionId: string;
  players: CoopPlayerState[];
}

export type CoopEvent =
  | { type: 'joined'; player: CoopPlayerState }
  | { type: 'moved'; player: CoopPlayerState }
  | { type: 'left'; connectionId: string }
  | { type: 'host'; hostConnectionId: string }
  | { type: 'monstersSpawned'; monsters: CoopMonsterSpawn[] }
  | { type: 'monsterStates'; states: CoopMonsterState[] }
  | { type: 'monstersRemoved'; ids: number[] }
  | { type: 'monsterDamaged'; id: number; amount: number }
  | { type: 'lootAdded'; drops: CoopLootAdd[] }
  | { type: 'lootRemoved'; itemIds: string[] }
  | { type: 'lootTaken'; itemId: string }
  | { type: 'lootDropped'; drop: CoopLootAdd };

/**
 * The co-op session for Diablo II: Survivors. Every hero in the same zone joins
 * one hub group; the hub relays presence, the zone host's monster roster and
 * the loot lying on the floor. The hub never simulates the game, and it has no
 * player-versus-player message: another hero can only ever be seen.
 */
@Injectable({ providedIn: 'root' })
export class D2SurvivorsCoopService implements OnDestroy {
  private hub: signalR.HubConnection | null = null;
  private connecting: Promise<boolean> | null = null;
  private zone: string | null = null;
  private connectionId = '';

  readonly events$ = new Subject<CoopEvent>();

  get currentZone(): string | null {
    return this.zone;
  }

  get isHost(): boolean {
    return this.hostConnectionId !== '' && this.hostConnectionId === this.connectionId;
  }

  private hostConnectionId = '';

  ngOnDestroy(): void {
    void this.disconnect();
    this.events$.complete();
  }

  /** Connects once; every later call reuses the live hub. */
  async connect(): Promise<boolean> {
    if (this.hub?.state === signalR.HubConnectionState.Connected) return true;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      try {
        const hub = new signalR.HubConnectionBuilder()
          .withUrl('/hubs/d2-survivors-coop')
          .withAutomaticReconnect([0, 1000, 3000, 8000])
          .configureLogging(signalR.LogLevel.Warning)
          .build();

        hub.on('PlayerJoined', (player: CoopPlayerState) => this.events$.next({ type: 'joined', player }));
        hub.on('PlayerMoved', (player: CoopPlayerState) => this.events$.next({ type: 'moved', player }));
        hub.on('PlayerLeft', (connectionId: string) => this.events$.next({ type: 'left', connectionId }));
        hub.on('HostChanged', (connectionId: string) => {
          this.hostConnectionId = connectionId;
          this.events$.next({ type: 'host', hostConnectionId: connectionId });
        });
        hub.on('MonstersSpawned', (monsters: CoopMonsterSpawn[]) => this.events$.next({ type: 'monstersSpawned', monsters }));
        hub.on('MonsterStates', (states: CoopMonsterState[]) => this.events$.next({ type: 'monsterStates', states }));
        hub.on('MonstersRemoved', (ids: number[]) => this.events$.next({ type: 'monstersRemoved', ids }));
        hub.on('MonsterDamaged', (hit: { id: number; amount: number }) =>
          this.events$.next({ type: 'monsterDamaged', id: hit.id, amount: hit.amount }));
        hub.on('LootAdded', (drops: CoopLootAdd[]) => this.events$.next({ type: 'lootAdded', drops }));
        hub.on('LootRemoved', (itemIds: string[]) => this.events$.next({ type: 'lootRemoved', itemIds }));
        hub.on('LootTakenByGuest', (taken: { itemId: string }) =>
          this.events$.next({ type: 'lootTaken', itemId: taken.itemId }));
        hub.on('LootDroppedByGuest', (drop: CoopLootAdd) => this.events$.next({ type: 'lootDropped', drop }));
        hub.onreconnected(() => {
          this.connectionId = hub.connectionId ?? '';
          // Rejoining re-syncs presence and hands back whatever the zone holds.
          if (this.zone) void this.rejoin();
        });

        await hub.start();
        this.hub = hub;
        this.connectionId = hub.connectionId ?? '';
        return true;
      } catch {
        this.hub = null;
        return false;
      } finally {
        this.connecting = null;
      }
    })();
    return this.connecting;
  }

  private rejoinZone: { zone: string; me: CoopPlayerState } | null = null;

  private async rejoin(): Promise<void> {
    if (!this.rejoinZone) return;
    const snapshot = await this.joinZone(this.rejoinZone.zone, this.rejoinZone.me);
    if (snapshot) this.applySnapshot(snapshot);
  }

  private applySnapshot(snapshot: CoopZoneSnapshot): void {
    this.zone = snapshot.zone;
    this.hostConnectionId = snapshot.hostConnectionId;
    for (const player of snapshot.players) {
      if (player.connectionId === this.connectionId) continue;
      this.events$.next({ type: 'joined', player });
    }
    this.events$.next({ type: 'host', hostConnectionId: snapshot.hostConnectionId });
  }

  /** Enters a zone: everything standing in it is handed back in the snapshot. */
  async joinZone(zone: string, me: CoopPlayerState): Promise<CoopZoneSnapshot | null> {
    this.rejoinZone = { zone, me };
    if (!(await this.connect()) || !this.hub) return null;
    try {
      const snapshot = await this.hub.invoke<CoopZoneSnapshot>('JoinZone', zone, me);
      this.applySnapshot(snapshot);
      return snapshot;
    } catch {
      return null;
    }
  }

  async leaveZone(): Promise<void> {
    this.rejoinZone = null;
    this.zone = null;
    this.hostConnectionId = '';
    if (!this.hub || this.hub.state !== signalR.HubConnectionState.Connected) return;
    try {
      await this.hub.invoke('LeaveZone');
    } catch {
      // A dropped session already left the zone on the server.
    }
  }

  // Every send below is advisory: a lost packet costs one frame of sync, never
  // a thrown game loop, so a disconnected hub simply drops it.

  updatePlayer(me: CoopPlayerState): void {
    this.send('UpdatePlayer', me);
  }

  monsterSpawned(zone: string, monsters: CoopMonsterSpawn[]): void {
    this.send('MonsterSpawned', zone, monsters);
  }

  monsterStates(zone: string, states: CoopMonsterState[]): void {
    this.send('MonsterStates', zone, states);
  }

  monsterRemoved(zone: string, ids: number[]): void {
    this.send('MonsterRemoved', zone, ids);
  }

  damageMonster(zone: string, id: number, amount: number): void {
    this.send('DamageMonster', zone, id, amount);
  }

  lootAdded(zone: string, drops: CoopLootAdd[]): void {
    this.send('LootAdded', zone, drops);
  }

  lootRemoved(zone: string, itemIds: string[]): void {
    this.send('LootRemoved', zone, itemIds);
  }

  lootTaken(zone: string, itemId: string): void {
    this.send('LootTaken', zone, itemId);
  }

  lootDropped(zone: string, drop: CoopLootAdd): void {
    this.send('LootDropped', zone, drop);
  }

  private send(method: string, ...args: unknown[]): void {
    if (!this.hub || this.hub.state !== signalR.HubConnectionState.Connected) return;
    void this.hub.send(method, ...args).catch(() => undefined);
  }

  async disconnect(): Promise<void> {
    const hub = this.hub;
    this.hub = null;
    this.zone = null;
    this.hostConnectionId = '';
    if (!hub) return;
    try {
      await hub.stop();
    } catch {
      // Already gone.
    }
  }
}
