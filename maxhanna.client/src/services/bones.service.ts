
import { Injectable } from '@angular/core'; 
import { MetaHero } from './datacontracts/bones/meta-hero';
import { MetaChat } from './datacontracts/bones/meta-chat';
import { Vector2 } from './datacontracts/bones/vector2';
import { MetaEvent } from './datacontracts/bones/meta-event';
import { InventoryItem } from '../app/bones/objects/InventoryItem/inventory-item';
import { MetaBot } from './datacontracts/bones/meta-bot';
import { HeroInventoryItem } from './datacontracts/bones/hero-inventory-item';

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
  async getPartyMembers(heroId: number): Promise<{ heroId: number, name: string, color?: string }[] | undefined> {
    return this.fetchData('/bones/getpartymembers', heroId);
  }
  async inviteToParty(heroId: number, targetHeroId: number) {
    return this.fetchData('/bones/invitetoparty', { HeroId: heroId, TargetHeroId: targetHeroId });
  }
  async leaveParty(heroId: number, userId?: number) {
    return this.fetchData('/bones/leaveparty', { HeroId: heroId, UserId: userId });
  }
  async removePartyMember(heroId: number, memberHeroId: number, userId?: number) {
    return this.fetchData('/bones/removepartymember', { HeroId: heroId, MemberHeroId: memberHeroId, UserId: userId });
  }
  async updateHeroStats(heroId: number, stats: { str: number; dex: number; int: number }, userId?: number) {
    return this.fetchData('/bones/updateherostats', { HeroId: heroId, Stats: stats, UserId: userId });
  }
  async townPortal(heroId: number, userId?: number) {
    return this.fetchData('/bones/townportal', { HeroId: heroId, UserId: userId });
  }
  async createTownPortal(heroId: number, map: string, x: number, y: number, userId?: number, radius?: number) {
    const body: any = { HeroId: heroId, Map: map, X: x, Y: y, UserId: userId };
    if (radius) body.Radius = radius;
    return this.fetchData('/bones/createtownportal', body);
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
  async fetchGameData(hero: MetaHero, recentAttacks?: any[]): Promise<{ map: number, position: Vector2, heroes: MetaHero[], chat: MetaChat[], events: MetaEvent[] } | undefined> {
    // Accept an optional recentAttacks array (caller is responsible for lifecycle of the queue).
    const body: any = { Hero: hero };
    if (recentAttacks && recentAttacks.length > 0) body.RecentAttacks = recentAttacks;

    return this.fetchData('/bones/fetchgamedata', body);
  }
  async fetchInventoryData(heroId: number): Promise<{ inventory: InventoryItem[], parts: HeroInventoryItem[] }> {
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
  async getMetabotHighscores(count: number = 50) {
    return this.fetchData('/bones/getmetabothighscores', count);
  } 
  async getHeroHighscores(count: number = 50) {
    return this.fetchData('/bones/getherohighscores', count);
  }

  async getHeroSelections(userId: number) {
    return this.fetchData('/bones/getheroselections', userId);
  }

  async createHeroSelection(userId: number) {
    return this.fetchData('/bones/createheroselection', userId);
  }

  async promoteHeroSelection(selectionId: number) {
    return this.fetchData('/bones/promoteheroselection', selectionId);
  }

  async deleteHeroSelection(selectionId: number) {
    return this.fetchData('/bones/deleteheroselection', selectionId);
  }

  async deleteHero(userId: number) {
    return this.fetchData('/bones/deletehero', userId);
  }

  async getActivePlayers(minutes: number = 2) {
    return this.fetchData('/bones/activeplayers', minutes);
  }

  async getUserRank(userId: number) {
    return this.fetchData('/bones/getuserrank', userId);
  }

  async respawnHero(heroId: number) {
    return this.fetchData('/bones/respawnhero', heroId);
  }
  async healHero(heroId: number) {
    return this.fetchData('/bones/healhero', heroId);
  }
}
