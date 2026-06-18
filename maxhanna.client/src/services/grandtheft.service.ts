import { Injectable } from '@angular/core';

export interface GTSaveData {
  posX: number; posZ: number; score: number;
}

export interface GTPlayerState {
  userId: number;
  posX: number; posY: number; posZ: number;
  yaw: number; pitch: number;
  carYaw: number; carSpeed: number;
  health: number; weapon: number;
  username: string;
}

export interface GTShotData {
  id: number;
  shooterId: number;
  weapon: number;
  originX: number; originY: number; originZ: number;
  dirX: number; dirY: number; dirZ: number;
}

export interface GTSyncResult {
  ok: boolean;
  players: GTPlayerState[];
  shots: GTShotData[];
}

@Injectable({ providedIn: 'root' })
export class GrandtheftService {
  constructor() {}

  private async get<T>(url: string): Promise<T | null> {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const text = await res.text();
      return text ? JSON.parse(text) as T : null;
    } catch { return null; }
  }

  private async post<T>(url: string, body: unknown): Promise<T | null> {
    try {
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      const text = await res.text();
      return text ? JSON.parse(text) as T : null;
    } catch { return null; }
  }

  async saveGame(userId: number, posX: number, posZ: number, score: number): Promise<boolean> {
    const res = await this.post<{ ok: boolean }>('/grandtheft/save', { userId, posX, posZ, score });
    return res?.ok ?? false;
  }

  async loadGame(userId: number): Promise<GTSaveData | null> {
    return this.get<GTSaveData>(`/grandtheft/load/${userId}`);
  }

  async getLeaderboard(): Promise<{ username: string; score: number }[] | null> {
    return this.get<{ username: string; score: number }[]>('/grandtheft/leaderboard');
  }

  async submitScore(userId: number, score: number): Promise<boolean> {
    const res = await this.post<{ ok: boolean }>('/grandtheft/submitscore', { userId, score });
    return res?.ok ?? false;
  }

  async updatePosition(
    userId: number, worldId: number,
    posX: number, posY: number, posZ: number,
    yaw: number, pitch: number,
    carYaw: number, carSpeed: number,
    health: number, weapon: number,
  ): Promise<GTSyncResult | null> {
    return this.post<GTSyncResult>('/grandtheft/updateposition', {
      userId, worldId, posX, posY, posZ, yaw, pitch, carYaw, carSpeed, health, weapon,
    });
  }

  async shoot(
    userId: number, worldId: number, weapon: number,
    originX: number, originY: number, originZ: number,
    dirX: number, dirY: number, dirZ: number,
  ): Promise<boolean> {
    const res = await this.post<{ ok: boolean }>('/grandtheft/shoot', {
      userId, worldId, weapon, originX, originY, originZ, dirX, dirY, dirZ,
    });
    return res?.ok ?? false;
  }

  async reportHit(attackerId: number, targetId: number, worldId: number, damage: number): Promise<{ remainingHealth: number } | null> {
    return this.post<{ ok: boolean; remainingHealth: number }>('/grandtheft/hit', { attackerId, targetId, worldId, damage });
  }

  async getNPCs(worldId: number): Promise<GTNPCSyncResult | null> {
    return this.get<GTNPCSyncResult>(`/grandtheft/npcs/${worldId}`);
  }

  async stealCar(npcId: number, userId: number): Promise<boolean> {
    const res = await this.post<{ ok: boolean }>(`/grandtheft/stealcar/${npcId}`, { userId });
    return res?.ok ?? false;
  }

  async parkCar(worldId: number, posX: number, posZ: number, yaw: number, colorR: number, colorG: number, colorB: number): Promise<{ ok: boolean; id: number } | null> {
    return this.post<{ ok: boolean; id: number }>('/grandtheft/parkcar', { worldId, posX, posZ, yaw, colorR, colorG, colorB });
  }
}

export interface GTNPCData {
  id: number;
  posX: number; posZ: number; yaw: number; speed: number;
  colorR: number; colorG: number; colorB: number;
}

export interface GTNPCSyncResult {
  cars: GTNPCData[];
  pedestrians: GTNPCData[];
  parkedCars: GTNPCData[];
}
