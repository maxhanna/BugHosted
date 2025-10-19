
import { Injectable } from '@angular/core'; 
import { MetaHero } from './datacontracts/bones/meta-hero';
import { MetaChat } from './datacontracts/bones/meta-chat';
import { Vector2 } from './datacontracts/bones/vector2';
import { MetaEvent } from './datacontracts/bones/meta-event';
import { InventoryItem } from '../app/bones/objects/InventoryItem/inventory-item';
import { MetaBot } from './datacontracts/bones/meta-bot';
import { MetaBotPart } from './datacontracts/bones/meta-bot-part';

@Injectable({
  providedIn: 'root'
})
export class BonesService {

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
    return this.fetchData('/bones', userId);
  }
  async getPartyMembers(userId: number): Promise<{ heroId: number, name: string, color?: string }[] | undefined> {
    return this.fetchData('/bones/getuserpartymembers', userId);
  }
  async createHero(userId: number, name: string): Promise<MetaHero | undefined> {
    return this.fetchData('/bones/create', { UserId: userId, Name: name });
  }
  async createBot(bot: MetaBot): Promise<MetaBot | undefined> {
    return this.fetchData('/bones/createbot', bot);
  }
  async equipPart(partId: number, metabotId: number) {
    return this.fetchData('/bones/equippart', { PartId: partId, MetabotId: metabotId });
  }
  async unequipPart(partId: number) {
    return this.fetchData('/bones/unequippart', { PartId: partId });
  }
  async sellBotParts(heroId: number, partIds: number[]) {
    return this.fetchData('/bones/sellbotparts', { HeroId: heroId, PartIds: partIds });
  }
  async fetchGameData(hero: MetaHero): Promise<{ map: number, position: Vector2, heroes: MetaHero[], chat: MetaChat[], events: MetaEvent[] } | undefined> {
    return this.fetchData('/bones/fetchgamedata', hero);
  }
  async fetchInventoryData(heroId: number): Promise<{ inventory: InventoryItem[], parts: MetaBotPart[] }> {
    return this.fetchData('/bones/fetchinventorydata', heroId);
  }
  async deleteEvent(eventId: number) {
    return this.fetchData('/bones/deleteevent', { EventId: eventId });
  }
  async updateEvents(event: MetaEvent) {
    return this.fetchData('/bones/updateevents', event);
  }
  async updateInventory(heroId: number, name: string, image: string, category: string) {
    return this.fetchData('/bones/updateinventory', { HeroId: heroId, Name: name, Image: image, Category: category });
  }
  async updateBotParts(heroId: number, parts: MetaBotPart[]) {
    return this.fetchData('/bones/updatebotparts', { HeroId: heroId, parts: parts });
  }
  async getMetabotHighscores(count: number = 50) {
    return this.fetchData('/bones/getmetabothighscores', count);
  } 
  async getHeroHighscores(count: number = 50) {
    return this.fetchData('/bones/getherohighscores', count);
  }

  async getActivePlayers(minutes: number = 2) {
    return this.fetchData('/bones/activeplayers', minutes);
  }

  async getUserRank(userId: number) {
    return this.fetchData('/bones/getuserrank', userId);
  }
}
