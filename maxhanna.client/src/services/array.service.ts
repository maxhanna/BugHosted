// user.service.ts
import { Injectable } from '@angular/core';
import { User } from './datacontracts/user'; 
import { ArrayCharacter } from './datacontracts/array-character';
import { GraveyardHero } from './datacontracts/array/graveyard-hero';
import { ArrayCharacterInventory } from './datacontracts/array-character-inventory';

@Injectable({
  providedIn: 'root'
})
export class ArrayService {
  async getHero(user?: User) {
    try {
      const response = await fetch(`/array`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user)
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

  async move(direction: string, user?: User) {
    try {
      const response = await fetch(`/array/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user, direction })
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


  async getInventory(user?: User) {
    try {
      const response = await fetch(`/array/getinventory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user)
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

  async getGraveyardHero(user?: User) {
    try {
      const response = await fetch(`/array/getgraveyardhero`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user)
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
  async resurrect(user?: User) {
    try {
      const response = await fetch(`/array/resurrect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user)
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
