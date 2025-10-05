
import { Injectable } from '@angular/core';
import { User } from './datacontracts/user/user';
import { MetaHero } from './datacontracts/ender/meta-hero';
import { MetaChat } from './datacontracts/ender/meta-chat';
import { Vector2 } from './datacontracts/ender/vector2';
import { MetaEvent } from './datacontracts/ender/meta-event';
import { InventoryItem } from '../app/ender/objects/InventoryItem/inventory-item';
import { MetaBot } from './datacontracts/ender/meta-bot';
import { MetaBotPart } from './datacontracts/ender/meta-bot-part';
 
@Injectable({
  providedIn: 'root'
})
export class EnderService {

  private async fetchData(url: string, body?: any) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : body
      });

      const res = await response;
      if (!res.ok) {
        return await res.text();
      }

      const contentType = response.headers.get('Content-Type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      } else {
        return await response.text();
      }
    } catch (error) {
      //console.error(error);
    }
  }

  async getHero(userId: number): Promise<MetaHero | undefined> {
    return this.fetchData('/ender', userId);
  } 
  async getPartyMembers(userId: number): Promise<{ heroId: number, name: string, color?: string }[] | undefined> {
    return this.fetchData('/ender/getuserpartymembers', userId);
  } 
  async createHero(userId: number, name: string): Promise<MetaHero | undefined> {
    return this.fetchData('/ender/create', { UserId: userId, Name: name });
  }
  async createBot(bot: MetaBot): Promise<MetaBot | undefined> {
    return this.fetchData('/ender/createbot', bot);
  }
  async equipPart(partId: number, metabotId: number) {
    return this.fetchData('/ender/equippart', { PartId: partId, MetabotId: metabotId });
  }
  async unequipPart(partId: number) {
    return this.fetchData('/ender/unequippart', { PartId: partId });
  }
  async sellBotParts(heroId: number, partIds: number[]) {
    return this.fetchData('/ender/sellbotparts', { HeroId: heroId, PartIds: partIds });
  }
  async fetchGameData(hero: MetaHero): Promise<{ map: number, position: Vector2, heroes: MetaHero[], chat: MetaChat[], events: MetaEvent[] } | undefined> {
    return this.fetchData('/ender/fetchgamedata', hero);
  }
  async fetchGameDataWithWalls(hero: MetaHero, pendingWalls: { x: number, y: number }[] | undefined) {
    const payload = { hero, pendingWalls };
    return this.fetchData('/ender/fetchgamedata', payload);
  }
  async fetchInventoryData(heroId: number): Promise<{inventory: InventoryItem[], parts: MetaBotPart[]}> {
    return this.fetchData('/ender/fetchinventorydata', heroId);
  } 
  async deleteEvent(eventId: number) {
    return this.fetchData('/ender/deleteevent', { EventId: eventId });
  }
  async updateEvents(event: MetaEvent) {
    return this.fetchData('/ender/updateevents', event);
  }
  async updateInventory(heroId: number, name: string, image: string, category: string) {
    return this.fetchData('/ender/updateinventory', { HeroId: heroId, Name: name, Image: image, Category: category });
  }
  async updateBotParts(heroId: number, parts: MetaBotPart[]) { 
    return this.fetchData('/ender/updatebotparts', { HeroId: heroId, parts: parts });
  }
  async recordDeath(heroId: number, userId: number | undefined, score: number, timeOnLevelSeconds: number, wallsPlaced: number, runStartTimeMs?: number) {
    return this.fetchData('/ender/herodied', { HeroId: heroId, UserId: userId ?? 0, Score: score, TimeOnLevel: timeOnLevelSeconds, WallsPlaced: wallsPlaced, RunStartMs: runStartTimeMs });
  }
  async getTopScores(limit = 50) {
    return this.fetchData('/ender/topscores', limit);
  }
  async getTopScoresToday(limit = 50) {
    return this.fetchData('/ender/topscorestoday', limit);
  }
  async getTopScoresForUser(userId: number) {
    return this.fetchData('/ender/topscoresforuser', userId);
  }
  async getBestScoreForUser(userId: number) {
    return this.fetchData('/ender/bestforuser', userId);
  }
}
