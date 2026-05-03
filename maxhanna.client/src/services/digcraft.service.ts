import { Injectable } from '@angular/core';
import { DCJoinResponse, DCBlockChange, DCPlayer, InvSlot } from '../app/digcraft/digcraft-types';
import { UserService } from './user.service';

@Injectable({
  providedIn: 'root'
})
export class DigcraftService {
  constructor(private userService: UserService) {}

  private normalizeInviteExpiresAt(value: number): number {
    if (!Number.isFinite(value)) return Date.now();
    if (value > 100000000000000) return Math.floor((value - 621355968000000000) / 10000);
    if (value > 1000000000000) return value;
    return value * 1000;
  }

  async joinWorld(userId: number, worldId: number): Promise<DCJoinResponse | null> {
    return this.post<DCJoinResponse>('/digcraft/join', { userId, worldId });
  }
 

  async getLastWorldId(userId: number): Promise<{ id: number } | null> {
    return this.get<{ id: number }>(`/digcraft/lastworldid?userId=${userId}`);
  }

  async updatePosition(userId: number, worldId: number, posX: number, posY: number, posZ: number, yaw: number, pitch: number): Promise<void> {
    await this.post('/digcraft/updateposition', { userId, worldId, posX, posY, posZ, yaw, pitch });
  }

  async updatePositionAndGetOthers(userId: number, worldId: number, posX: number, posY: number, posZ: number, yaw: number, pitch: number, bodyYaw?: number): Promise<any> {
    return this.post('/digcraft/updatepositionandgetothers', { userId, worldId, posX, posY, posZ, yaw, pitch, bodyYaw });
  }

  async syncPlayers(userId: number, worldId: number, posX: number, posY: number, posZ: number, yaw: number, pitch: number, bodyYaw?: number, isAttacking?: boolean, isDefending?: boolean, leftHand?: number, weaponDur?: number, helmetDur?: number, chestDur?: number, legsDur?: number, bootsDur?: number): Promise<any> {
    return this.post('/digcraft/syncplayers', { userId, worldId, posX, posY, posZ, yaw, pitch, bodyYaw, isAttacking, isDefending, leftHand, weaponDur, helmetDur, chestDur, legsDur, bootsDur });
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
    const invites = await this.post<{ fromUserId: number; username: string; expiresAt: number }[] | null>('/digcraft/pendinginvites', { userId });
    return invites?.map(inv => ({ ...inv, expiresAt: this.normalizeInviteExpiresAt(inv.expiresAt) })) ?? null;
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

  async placeBlocks(
    userId: number, 
    worldId: number, 
    items: { 
      chunkX: number; 
      chunkZ: number; 
      localX: number; 
      localY: number; 
      localZ: number; 
      blockId: number; 
      waterLevel?: number; 
      fluidIsSource?: boolean; 
      previousBlockId?: number, 
      aboveBlockId?: number, 
      belowBlockId?: number,
      leftBlockId?: number,
      rightBlockId?: number
    }[], 
    clientEquipmentBefore?: any
  ): Promise<{ ok: boolean; count: number; equipment?: any } | null> {
    const body: any = { userId, worldId, items };
    if (clientEquipmentBefore) body.clientEquipmentBefore = clientEquipmentBefore;
    return this.post<{ ok: boolean; count: number; equipment?: any }>('/digcraft/placeblocks', body);
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

  async getPartyMembers(userId: number): Promise<{ userId: number; username: string; isLeader?: boolean }[] | null> {
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

  async leaveParty(userId: number): Promise<{ ok: boolean; message: string } | null> {
    return this.post<{ ok: boolean; message: string }>('/digcraft/leaveparty', { userId });
  }

  async acceptPartyInvite(userId: number, fromUserId: number): Promise<{ ok: boolean; message: string } | null> {
    return this.post<{ ok: boolean; message: string }>('/digcraft/acceptpartyinvite', { userId, fromUserId });
  }
  
  async clearPartyInvite(fromUserId: number, toUserId: number): Promise<{ ok: boolean } | null> {
    return this.post<{ ok: boolean }>('/digcraft/clearpartyinvite', { fromUserId, toUserId });
  }

  async attackMob(attackerUserId: number, worldId: number, mobId: number, weaponId = 0, attackerPosX?: number, attackerPosY?: number, attackerPosZ?: number, attackerPosProvided: boolean = false): Promise<{ ok: boolean; damage: number; mobId: number; health: number; dead?: boolean; drops?: { itemId: number; quantity: number }[] } | null> {
    const body: any = { attackerUserId, worldId, mobId, weaponId };
    if (attackerPosProvided) {
      body.attackerPosX = attackerPosX ?? 0;
      body.attackerPosY = attackerPosY ?? 0;
      body.attackerPosZ = attackerPosZ ?? 0;
      body.attackerPosProvided = true;
    }
    return this.post<{ ok: boolean; damage: number; mobId: number; health: number; dead?: boolean; drops?: { itemId: number; quantity: number }[] }>('/digcraft/attackmob', body);
  }

  async applyFallDamage(userId: number, worldId: number, fallDistance: number, posX: number, posY: number, posZ: number, inWater?: boolean): Promise<{ ok: boolean; damage: number; health: number } | null> {
    return this.post<{ ok: boolean; damage: number; health: number }>('/digcraft/falldamage', { userId, worldId, fallDistance, posX, posY, posZ, inWater: !!inWater });
  }

  async respawn(userId: number, worldId: number): Promise<{ player: any; inventory: any[]; equipment: any } | null> {
    return this.post<{ player: any; inventory: any[]; equipment: any }>('/digcraft/respawn', { userId, worldId });
  }

  async killPlayer(userId: number, worldId: number): Promise<{ ok: boolean; message: string } | null> {
    return this.post<{ ok: boolean; message: string }>('/digcraft/killplayer', { userId, worldId });
  }

  async changeColor(userId: number, worldId: number, color: string): Promise<{ ok: boolean; color: string } | null> {
    return this.post<{ ok: boolean; color: string }>('/digcraft/changecolor', { userId, worldId, color });
  }

  async changeFace(userId: number, worldId: number, face: string): Promise<{ ok: boolean; face: string } | null> {
    return this.post<{ ok: boolean; face: string }>('/digcraft/changeface', { userId, worldId, face });
  }

  async getUserFaces(userId: number): Promise<{ id: number; name: string; emoji: string; gridData: string; paletteData: string; creatorUserId?: number }[] | null> {
    return this.get<{ id: number; name: string; emoji: string; gridData: string; paletteData: string; creatorUserId?: number }[]>(`/digcraft/userfaces?userId=${userId}`);
  }

  async saveUserFace(userId: number, name: string, emoji: string, gridData: string, paletteData: string): Promise<{ ok: boolean; id: number } | null> {
    return this.post<{ ok: boolean; id: number }>('/digcraft/userfaces', { userId, name, emoji, gridData, paletteData });
  }

  async deleteUserFace(userId: number, faceId: number): Promise<{ success: boolean } | null> {
    return this.post<{ success: boolean }>('/digcraft/deleteuserface', { userId, faceId });
  }

  async getKnownRecipes(userId: number): Promise<{ recipeIds: number[] } | null> {
    return this.get<{ recipeIds: number[] }>(`/digcraft/knownrecipes?userId=${userId}`);
  }

  async addKnownRecipe(userId: number, recipeId: number): Promise<{ ok: boolean } | null> {
    return this.post<{ ok: boolean }>('/digcraft/knownrecipes', { userId, recipeId });
  }

  async saveInventory(userId: number, worldId: number, slots: { slot: number; itemId: number; quantity: number }[], equipment?: { helmet?: number; chest?: number; legs?: number; boots?: number; weapon?: number; leftHand?: number }, hunger?: number): Promise<void> {
    await this.post('/digcraft/saveinventory', { userId, worldId, slots, equipment, hunger });
  }

  async placeBonfire(userId: number, worldId: number, x: number, y: number, z: number): Promise<{ success: boolean; } | null> {
    return this.post<{ success: boolean; }>('/digcraft/placebonfire', { userId, worldId, x, y, z });
  }

  async getBonfires(worldId: number, userId: number): Promise<{ id: number; x: number; y: number; z: number; nickname: string }[]> {
    const res = await fetch(`/digcraft/getbonfires?worldId=${worldId}&userId=${userId}`);
    if (!res.ok) return [];
    return res.json() as Promise<{ id: number; x: number; y: number; z: number; nickname: string }[]>;
  }

  async renameBonfire(userId: number, worldId: number, bonfireId: number, nickname: string): Promise<{ success: boolean } | null> {
    return this.post<{ success: boolean }>('/digcraft/renamebonfire', { userId, worldId, bonfireId, nickname });
  }

  async deleteBonfire(userId: number, worldId: number, bonfireId: number): Promise<{ success: boolean } | null> {
    return this.post<{ success: boolean }>('/digcraft/deletebonfire', { userId, worldId, bonfireId });
  }

  async placeChest(userId: number, worldId: number, x: number, y: number, z: number): Promise<{ success: boolean; id?: number } | null> {
    return this.post<{ success: boolean; id?: number }>('/digcraft/placechest', { userId, worldId, x, y, z });
  }

  async getChest(worldId: number, userId: number, x: number, y: number, z: number): Promise<{ id: number; x: number; y: number; z: number; nickname: string; items: Array<{ itemId: number; quantity: number }> } | null> {
    const res = await fetch(`/digcraft/getchest?worldId=${worldId}&userId=${userId}&x=${x}&y=${y}&z=${z}`);
    if (!res.ok) return null;
    return res.json() as Promise<{ id: number; x: number; y: number; z: number; nickname: string; items: Array<{ itemId: number; quantity: number }> } | null>;
  }

  async getChests(worldId: number, userId: number): Promise<{ id: number; x: number; y: number; z: number; nickname: string; items: Array<{ itemId: number; quantity: number }> }[]> {
    const res = await fetch(`/digcraft/getchests?worldId=${worldId}&userId=${userId}`);
    if (!res.ok) return [];
    return res.json() as Promise<{ id: number; x: number; y: number; z: number; nickname: string; items: Array<{ itemId: number; quantity: number }> }[]>;
  }

  async renameChest(userId: number, worldId: number, chestId: number, nickname: string): Promise<{ success: boolean } | null> {
    return this.post<{ success: boolean }>('/digcraft/renamechest', { userId, worldId, chestId, nickname });
  }

  async deleteChest(userId: number, worldId: number, chestId: number): Promise<{ success: boolean } | null> {
    return this.post<{ success: boolean }>('/digcraft/deletechest', { userId, worldId, chestId });
  }

  async updateChestItems(userId: number, worldId: number, chestId: number, items: Array<{ itemId: number; quantity: number }>): Promise<{ success: boolean } | null> {
    return this.post<{ success: boolean }>('/digcraft/updatechestitems', { userId, worldId, chestId, items });
  }

  private async get<T>(url: string): Promise<T | null> {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const text = await res.text();
      return text ? JSON.parse(text) as T : null;
    } catch {
      return null;
    }
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
