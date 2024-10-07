
import { Injectable } from '@angular/core';
import { User } from './datacontracts/user/user';
import { MetaHero } from './datacontracts/meta/meta-hero';
import { MetaChat } from './datacontracts/meta/meta-chat';
import { Vector2 } from './datacontracts/meta/vector2';
import { MetaEvent } from './datacontracts/meta/meta-event';
 
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

  async getHero(user: User): Promise<MetaHero | undefined> {
    return this.fetchData('/meta', user);
  }
  async updateHero(user: User, hero: MetaHero): Promise< MetaHero | undefined> {
    return this.fetchData('/meta/updatehero', { User: user, Hero: hero });
  }
  async createHero(user: User, name: string): Promise<MetaHero | undefined> {
    return this.fetchData('/meta/create', { User: user, Name: name });
  }
  async fetchGameData(hero: MetaHero): Promise<{ map: number, position: Vector2, heroes: MetaHero[], chat: MetaChat[], events: MetaEvent[] } | undefined> {
    return this.fetchData('/meta/fetchgamedata', hero);
  }
  async chat(hero: MetaHero, content: string) {
    return this.fetchData('/meta/chat', {Hero: hero, Content: content});
  }
  async updateEvents(event: MetaEvent) {
    return this.fetchData('/meta/updateevents', event);
  }
}
