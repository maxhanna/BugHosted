
import { Injectable } from '@angular/core'; 
import { MetaHero } from './datacontracts/bones/meta-hero';
import { MetaChat } from './datacontracts/bones/meta-chat';
import { Vector2 } from './datacontracts/bones/vector2';
import { MetaEvent } from './datacontracts/bones/meta-event';
import { InventoryItem } from '../app/bones/objects/InventoryItem/inventory-item';
import { MetaBot } from './datacontracts/bones/meta-bot';
import { HeroInventoryItem } from './datacontracts/bones/hero-inventory-item';
import { CreateTownPortalRequest } from './datacontracts/bones/create-town-portal-request';
import { PartyMember } from './datacontracts/bones/party-member';

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
  async getPartyMembers(heroId: number): Promise<PartyMember[] | undefined> {
    const raw = await this.fetchData('/bones/getpartymembers', heroId);
    if (!Array.isArray(raw)) return undefined;
    // Map both legacy camelCase (old anonymous object) and new PascalCase (PartyMemberDto) to unified camelCase interface
    const mapped: PartyMember[] = raw.map((pm: any) => ({
      heroId: pm.heroId ?? pm.HeroId,
      name: pm.name ?? pm.Name,
      color: pm.color ?? pm.Color,
      type: pm.type ?? pm.Type ?? 'knight',
      level: pm.level ?? pm.Level ?? 0,
      hp: pm.hp ?? pm.Hp ?? 0,
      map: pm.map ?? pm.Map,
      exp: pm.exp ?? pm.Exp ?? 0
    }));
    return mapped;
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
  // Accept a generic stats object so we can send new stat keys (attackDmg, critRate, critDmg, health, regen, attackSpeed, etc.)
  async updateHeroStats(heroId: number, stats: { [key: string]: number | undefined } | any, userId?: number) {
    return this.fetchData('/bones/updateherostats', { HeroId: heroId, Stats: stats, UserId: userId });
  }
  async updateCurrentSkill(heroId: number, currentSkill: string) {
    return this.fetchData('/bones/updatecurrentskill', { HeroId: heroId, CurrentSkill: currentSkill });
  }
  async saveHeroSkills(heroId: number, skillA: number, skillB: number, skillC: number) {
    return this.fetchData('/bones/saveheroskills', { HeroId: heroId, SkillA: skillA, SkillB: skillB, SkillC: skillC });
  }
  async getHeroSkills(heroId: number): Promise<{ skillA: number, skillB: number, skillC: number, currentSkill?: string } | undefined> {
    const res: any = await this.fetchData('/bones/getheroskills', heroId);
    if (!res) return undefined; 
    const skillA = Number(res.skillA ?? res.skill_a ?? res.SkillA ?? res.Skill_a ?? 0);
    const skillB = Number(res.skillB ?? res.skill_b ?? res.SkillB ?? res.Skill_b ?? 0);
    const skillC = Number(res.skillC ?? res.skill_c ?? res.SkillC ?? res.Skill_c ?? 0);
    const currentSkill = (res.currentSkill ?? res.current_skill ?? res.CurrentSkill ?? res.Current_Skill) as string | undefined;
    return { skillA, skillB, skillC, currentSkill };
  }
  async townPortal(heroId: number, userId?: number) {
    return this.fetchData('/bones/townportal', { HeroId: heroId, UserId: userId });
  }
  async createTownPortal(req: CreateTownPortalRequest) {
    // Map TypeScript-friendly names to server-expected casing
    const body: any = { HeroId: req.heroId, Map: req.map ?? undefined, X: req.x, Y: req.y, UserId: req.userId };
    if (req.radius !== undefined && req.radius !== null) body.Radius = req.radius;
    return this.fetchData('/bones/createtownportal', body);
  }
  async createHero(userId: number, name: string, type: string): Promise<MetaHero | undefined> {
    return this.fetchData('/bones/create', { UserId: userId, Name: name, Type: type });
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
    const body: any = { Hero: hero };
    if (recentAttacks && recentAttacks.length > 0) 
      body.RecentAttacks = recentAttacks;

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

  async getHeroNames(userId: number): Promise<string[] | undefined> {
    return this.fetchData('/bones/getheronames', userId);
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

  async getActivePlayersList(minutes: number = 5) {
    return this.fetchData('/bones/getactiveplayerslist', minutes);
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
  async deleteTownPortal(heroId: number) { 
    return this.fetchData('/bones/deletetownportal',  { HeroId: heroId });
  }
}
