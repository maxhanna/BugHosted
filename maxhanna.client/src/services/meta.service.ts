
import { Injectable } from '@angular/core';
import { User } from './datacontracts/user/user';
import { MetaHero } from './datacontracts/meta/meta-hero';
 
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

  async getHero(user: User): Promise<{ MetaHero: MetaHero; } | undefined> {
    return await this.fetchData('/meta', { User: user });
  }
  async updateHero(user: User, hero: MetaHero): Promise<{ MetaHero: MetaHero; } | undefined> {
    return await this.fetchData('/meta/updatehero', { User: user, Hero: hero });
  }
  async createHero(user: User, name: string): Promise<{ MetaHero: MetaHero; } | undefined> {
    return await this.fetchData('/meta/create', { User: user, Name: name });
  } 
}
