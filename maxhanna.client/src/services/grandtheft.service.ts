import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface GTNPCData {
  id: number;
  posX: number;
  posZ: number;
  yaw: number;
  speed: number;
  colorR: number;
  colorG: number;
  colorB: number;
  type?: string;
  gender?: string;
  health?: number;
}

export interface GTNPCResponse {
  cars: GTNPCData[];
  pedestrians: GTNPCData[];
  parkedCars: GTNPCData[];
}

export interface GTPlayerState {
  userId: number;
  posX: number;
  posY: number;
  posZ: number;
  yaw: number;
  pitch: number;
  carYaw: number;
  carSpeed: number;
  health: number;
  weapon: number;
  username: string;
  isShooting: boolean;
  modelUrl?: string;
}

export interface GTUpdatePositionResponse {
  ok: boolean;
  players: GTPlayerState[];
  shots?: any[];
  yourHealth?: number;
  wantedLevel?: number;
  yourMoney?: number;
}

@Injectable({
  providedIn: 'root'
})
export class GrandtheftService {
  private baseUrl = '/grandtheft';

  constructor(private http: HttpClient) { }

  async getNPCs(worldId: number, posX: number, posZ: number, userId: number): Promise<GTNPCResponse | null> {
    try {
      return await this.http.get<GTNPCResponse>(`${this.baseUrl}/npcs/${worldId}?posX=${posX}&posZ=${posZ}&userId=${userId}`).toPromise() ?? null;
    } catch (e) {
      console.error('Error fetching NPCs', e);
      return null;
    }
  }

  async updatePosition(
    userId: number, worldId: number,
    posX: number, posY: number, posZ: number,
    yaw: number, pitch: number,
    carYaw: number, carSpeed: number,
    health: number, weapon: number, isShooting: boolean
    , modelUrl?: string, money?: number
  ): Promise<GTUpdatePositionResponse | null> {
    try {
      const body: any = { userId, worldId, posX, posY, posZ, yaw, pitch, carYaw, carSpeed, health, weapon, isShooting };
      if (modelUrl) body.modelUrl = modelUrl;
      if (money !== undefined) body.money = money;
      return await this.http.post<GTUpdatePositionResponse>(`${this.baseUrl}/updateposition`, body).toPromise() ?? null;
    } catch (e) {
      console.error('Error updating position', e);
      return null;
    }
  }

  async stealCar(npcId: number, userId: number): Promise<void> {
    try {
      await this.http.post(`${this.baseUrl}/stealcar/${npcId}`, { userId, worldId: 1 }).toPromise();
    } catch (e) {
      console.error('Error stealing car', e);
    }
  }

  async parkCar(worldId: number, posX: number, posZ: number, yaw: number, colorR: number, colorG: number, colorB: number): Promise<any> {
    try {
      return await this.http.post(`${this.baseUrl}/parkcar`, { worldId, posX, posZ, yaw, colorR, colorG, colorB }).toPromise();
    } catch (e) {
      console.error('Error parking car', e);
      return null;
    }
  }

  async hit(attackerId: number, targetId: number, worldId: number, damage: number): Promise<void> {
    try {
      await this.http.post(`${this.baseUrl}/hit`, { attackerId, targetId, worldId, damage }).toPromise();
    } catch (e) {
      console.error('Error registering hit', e);
    }
  }

  async saveGame(userId: number, posX: number, posZ: number, score: number): Promise<void> {
    try {
      await this.http.post(`${this.baseUrl}/save`, { userId, posX, posZ, score }).toPromise();
    } catch (e) {
      console.error('Error saving game', e);
    }
  }

  async loadGame(userId: number): Promise<any> {
    try {
      return await this.http.get(`${this.baseUrl}/load/${userId}`).toPromise();
    } catch (e) {
      console.error('Error loading game', e);
      return null;
    }
  }

  async submitScore(userId: number, score: number): Promise<void> {
    try {
      await this.http.post(`${this.baseUrl}/submitscore`, { userId, score }).toPromise();
    } catch (e) {
      console.error('Error submitting score', e);
    }
  }
}