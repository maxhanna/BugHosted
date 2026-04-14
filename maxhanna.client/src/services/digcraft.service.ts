import { Injectable } from '@angular/core';
import { DCJoinResponse, DCBlockChange, DCPlayer, InvSlot } from '../app/digcraft/digcraft-types';

@Injectable({
  providedIn: 'root'
})
export class DigcraftService {

  async joinWorld(userId: number, worldId: number): Promise<DCJoinResponse | null> {
    return this.post<DCJoinResponse>('/digcraft/join', { userId, worldId });
  }

  async updatePosition(userId: number, worldId: number, posX: number, posY: number, posZ: number, yaw: number, pitch: number): Promise<void> {
    await this.post('/digcraft/updateposition', { userId, worldId, posX, posY, posZ, yaw, pitch });
  }

  async syncPlayers(userId: number, worldId: number, posX: number, posY: number, posZ: number, yaw: number, pitch: number): Promise<DCPlayer[]> {
    const res = await this.post<DCPlayer[]>('/digcraft/syncplayers', { userId, worldId, posX, posY, posZ, yaw, pitch });
    return res ?? [];
  }

  async getPlayers(worldId: number): Promise<DCPlayer[]> {
    const res = await fetch(`/digcraft/players/${worldId}`);
    if (!res.ok) return [];
    return res.json() as Promise<DCPlayer[]>;
  }

  async getActivePlayers(minutes: number = 2) {
    return this.post('/digcraft/activeplayers', minutes);
  }

  async getPendingInvites(userId: number): Promise<{ fromUserId: number; username: string; expiresAt: number }[] | null> {
    return this.post<{ fromUserId: number; username: string; expiresAt: number }[] | null>('/digcraft/pendinginvites', { userId });
  }

  async postChat(userId: number, worldId: number, message: string): Promise<void> {
    await this.post('/digcraft/chat', { userId, worldId, message });
  }

  async getChats(worldId: number): Promise<{ userId: number; message: string; createdAt: string; username: string }[]> {
    const res = await fetch(`/digcraft/chats/${worldId}`);
    if (!res.ok) return [];
    return res.json() as Promise<{ userId: number; message: string; createdAt: string; username: string }[]>;
  }

  async getChunkChanges(worldId: number, chunkX: number, chunkZ: number): Promise<DCBlockChange[]> {
    return (await this.post<DCBlockChange[]>('/digcraft/getchunkchanges', { worldId, chunkX, chunkZ })) ?? [];
  }

  async getWorlds(): Promise<{ id: number; seed: number; modifiedBlocks: number; playersOnline: number }[]> {
    try {
      const res = await fetch('/digcraft/worlds');
      if (!res.ok) return [];
      return res.json() as Promise<{ id: number; seed: number; modifiedBlocks: number; playersOnline: number }[]>;
    } catch {
      return [];
    }
  }

  async setWorldSeed(worldId: number, seed: number): Promise<{ ok: boolean; seed: number } | null> {
    return this.post<{ ok: boolean; seed: number }>('/digcraft/setseed', { worldId, seed });
  }

  async placeBlock(userId: number, worldId: number, chunkX: number, chunkZ: number, localX: number, localY: number, localZ: number, blockId: number): Promise<void> {
    await this.post('/digcraft/placeblock', { userId, worldId, chunkX, chunkZ, localX, localY, localZ, blockId });
  }

  async placeBlocks(userId: number, worldId: number, items: { chunkX: number; chunkZ: number; localX: number; localY: number; localZ: number; blockId: number }[]): Promise<{ ok: boolean; count: number } | null> {
    return this.post<{ ok: boolean; count: number }>('/digcraft/placeblocks', { userId, worldId, items });
  }

  async attack(attackerUserId: number, targetUserId: number, worldId: number, weaponId = 0, posX = 0, posY = 0, posZ = 0): Promise<{ ok: boolean; damage: number; targetUserId: number; health: number } | null> {
    return this.post<{ ok: boolean; damage: number; targetUserId: number; health: number }>('/digcraft/attack', { attackerUserId, targetUserId, worldId, weaponId, posX, posY, posZ });
  }

  async mobAttack(userId: number, worldId: number, mobType: string, damage: number): Promise<{ ok: boolean; damage: number; health: number } | null> {
    return this.post<{ ok: boolean; damage: number; health: number }>('/digcraft/mobattack', { userId, worldId, mobType, damage });
  }

  // Returns either an object { mobs: [...], mobTickMs, mobEpochStartMs } or an array (legacy)
  async getMobs(worldId: number): Promise<any> {
    try {
      const res = await fetch(`/digcraft/mobs/${worldId}`);
      if (!res.ok) return [];
      const json = await res.json();
      return json;
    } catch {
      return [];
    }
  }

  async getPartyMembers(userId: number): Promise<{ userId: number; username: string }[] | null> {
    return this.post('/digcraft/partymembers', { UserId: userId });
  }

  async sendPartyInvite(userId: number, targetUserId: number): Promise<{ ok: boolean; message: string } | null> {
    return this.post('/digcraft/sendpartyinvite', { LeaderUserId: userId, TargetUserId: targetUserId });
  }

  async addToParty(leaderUserId: number, targetUserId: number): Promise<{ ok: boolean; message: string } | null> {
    return this.post<{ ok: boolean; message: string }>('/digcraft/addtoparty', { leaderUserId, targetUserId });
  }

  async removeFromParty(leaderUserId: number, targetUserId: number): Promise<{ ok: boolean; message: string } | null> {
    return this.post<{ ok: boolean; message: string }>('/digcraft/removefromparty', { leaderUserId, targetUserId });
  }

  async attackMob(attackerUserId: number, worldId: number, mobId: number, weaponId = 0, attackerPosX?: number, attackerPosY?: number, attackerPosZ?: number, attackerPosProvided: boolean = false): Promise<{ ok: boolean; damage: number; mobId: number; health: number; dead?: boolean } | null> {
    const body: any = { attackerUserId, worldId, mobId, weaponId };
    if (attackerPosProvided) {
      body.attackerPosX = attackerPosX ?? 0;
      body.attackerPosY = attackerPosY ?? 0;
      body.attackerPosZ = attackerPosZ ?? 0;
      body.attackerPosProvided = true;
    }
    return this.post<{ ok: boolean; damage: number; mobId: number; health: number; dead?: boolean }>('/digcraft/attackmob', body);
  }

  async applyFallDamage(userId: number, worldId: number, fallDistance: number, posX: number, posY: number, posZ: number): Promise<{ ok: boolean; damage: number; health: number } | null> {
    return this.post<{ ok: boolean; damage: number; health: number }>('/digcraft/falldamage', { userId, worldId, fallDistance, posX, posY, posZ });
  }

  async respawn(userId: number, worldId: number): Promise<{ player: any; inventory: any[]; equipment: any } | null> {
    return this.post<{ player: any; inventory: any[]; equipment: any }>('/digcraft/respawn', { userId, worldId });
  }

  async changeColor(userId: number, worldId: number, color: string): Promise<{ ok: boolean; color: string } | null> {
    return this.post<{ ok: boolean; color: string }>('/digcraft/changecolor', { userId, worldId, color });
  }

  async saveInventory(userId: number, worldId: number, slots: { slot: number; itemId: number; quantity: number }[], equipment?: { helmet?: number; chest?: number; legs?: number; boots?: number; weapon?: number }): Promise<void> {
    await this.post('/digcraft/saveinventory', { userId, worldId, slots, equipment });
  }

  private async post<T>(url: string, body: unknown): Promise<T | null> {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      const text = await res.text();
      return text ? JSON.parse(text) as T : null;
    } catch {
      return null;
    }
  }
}
