
import { Injectable } from '@angular/core';
import { User } from './datacontracts/user/user';
import { MetaHero } from './datacontracts/meta/meta-hero';
import { MetaChat } from './datacontracts/meta/meta-chat';
import { Vector2 } from './datacontracts/meta/vector2';
import { MetaEvent } from './datacontracts/meta/meta-event';
import { InventoryItem } from '../app/meta/objects/InventoryItem/inventory-item';
import { MetaBot } from './datacontracts/meta/meta-bot';
import { MetaBotPart } from './datacontracts/meta/meta-bot-part';
 
@Injectable({
  providedIn: 'root'
})
export class MetaService {

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
    return this.fetchData('/meta', userId);
  } 
  async createHero(userId: number, name: string): Promise<MetaHero | undefined> {
    return this.fetchData('/meta/create', { UserId: userId, Name: name });
  }
  async createBot(bot: MetaBot): Promise<MetaBot | undefined> {
    return this.fetchData('/meta/createbot', bot);
  }
  async equipPart(partId: number, metabotId: number) {
    return this.fetchData('/meta/equippart', { PartId: partId, MetabotId: metabotId });
  }
  async unequipPart(partId: number) {
    return this.fetchData('/meta/unequippart', { PartId: partId });
  }
  async sellBotParts(heroId: number, partIds: number[]) {
    return this.fetchData('/meta/sellbotparts', { HeroId: heroId, PartIds: partIds });
  }
  async fetchGameData(hero: MetaHero): Promise<{ map: number, position: Vector2, heroes: MetaHero[], chat: MetaChat[], events: MetaEvent[] } | undefined> {
    return this.fetchData('/meta/fetchgamedata', hero);
  }
  async fetchInventoryData(heroId: number): Promise<{inventory: InventoryItem[], parts: MetaBotPart[]}> {
    return this.fetchData('/meta/fetchinventorydata', heroId);
  } 
  async deleteEvent(eventId: number) {
    return this.fetchData('/meta/deleteevent', { EventId: eventId });
  }
  async updateEvents(event: MetaEvent) {
    return this.fetchData('/meta/updateevents', event);
  }
  async updateInventory(heroId: number, name: string, image: string, category: string) {
    return this.fetchData('/meta/updateinventory', { HeroId: heroId, Name: name, Image: image, Category: category });
  }
  async updateBotParts(heroId: number, parts: MetaBotPart[]) { 
    return this.fetchData('/meta/updatebotparts', { HeroId: heroId, parts: parts });
  }
}
