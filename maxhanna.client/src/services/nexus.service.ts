// user.service.ts
import { Injectable } from '@angular/core';
import { User } from './datacontracts/user/user';
 
@Injectable({
  providedIn: 'root'
})
export class NexusService {
  async getNexus(user?: User) {
    try {
      const response = await fetch(`/nexus`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user)
      });

      if (!response.ok) {
        throw new Error(`Error fetching hero: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(error);
      return undefined;
    } 
  }
}
