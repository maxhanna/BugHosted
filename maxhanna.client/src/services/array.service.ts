// user.service.ts
import { Injectable } from '@angular/core'; 
import { GraveyardHero } from './datacontracts/array/graveyard-hero'; 
import { ArrayCharacter } from './datacontracts/array/array-character';
import { User } from './datacontracts/user/user';
import { ArrayCharacterInventory } from './datacontracts/array/array-character-inventory';

@Injectable({
  providedIn: 'root'
})
export class ArrayService {
  async getHero(userId?: number) {
    try {
      const response = await fetch(`/array`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId ?? 0)
      });

      if (!response.ok) {
        throw new Error(`Error fetching hero: ${response.statusText}`);
      }

      return await response.json() as ArrayCharacter;
    } catch (error) {
      console.error(error);
      return undefined;
    }
  }

  async getAllHeros() {
    try {
      const response = await fetch(`/array/players`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`Error fetching hero list: ${response.statusText}`);
      }

      return await response.json() as ArrayCharacter[];
    } catch (error) {
      console.error(error);
      return undefined;
    }
  }

  async move(direction: string, userId?: number) {
    try {
      const response = await fetch(`/array/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: (userId ?? 0) , Direction: direction })
      });

      if (!response.ok) {
        throw new Error(`Error fetching hero: ${response.statusText}`);
      }

      return await response.json() as ArrayCharacter;
    } catch (error) {
      console.error(error);
      return undefined;
    }
  }


  async getInventory(userId?: number) {
    try {
      const response = await fetch(`/array/getinventory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId ?? 0)
      });

      if (!response.ok) {
        throw new Error(`Error fetching hero's inventory: ${response.statusText}`);
      }

      return await response.json() as ArrayCharacterInventory;
    } catch (error) {
      console.error(error);
      return undefined;
    }
  }

  async getGraveyardHero(userId?: number) {
    try {
      const response = await fetch(`/array/getgraveyardhero`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId ?? 0)
      });

      if (!response.ok) {
        throw new Error(`Error fetching hero: ${response.statusText}`);
      }

      return await response.json() as GraveyardHero;
    } catch (error) {
      console.error(error);
      return undefined;
    }
  }
  async resurrect(userId?: number) {
    try {
      const response = await fetch(`/array/resurrect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId ?? 0)
      });

      if (!response.ok) {
        throw new Error(`Error resurrecting hero: ${response.statusText}`);
      }

      return await response.json() as ArrayCharacter;
    } catch (error) {
      console.error(error);
      return undefined;
    }
  }
}
