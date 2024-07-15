import { Injectable } from '@angular/core';
import { User } from './datacontracts/user/user'; 
import { NexusBase } from './datacontracts/nexus/nexus-base';
import { NexusBaseUpgrades } from './datacontracts/nexus/nexus-base-upgrades';

@Injectable({
  providedIn: 'root'
})
export class NexusService {

  private async fetchData(url: string, body: any) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`Error fetching data: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(error);
      return undefined;
    }
  }

  async getNexus(user: User): Promise<{ nexusBase: NexusBase, nexusBaseUpgrades: NexusBaseUpgrades } | undefined> {
    return await this.fetchData('/nexus', user);
  }

  async upgradeNexus(user: User): Promise<any> {
    return await this.fetchData('/nexus/upgradenexus', user);
  }

  async upgradeMine(user: User): Promise<any> {
    return await this.fetchData('/nexus/upgrademine', user);
  }

  async upgradeSupplyDepot(user: User): Promise<any> {
    return await this.fetchData('/nexus/upgradesupplydepot', user);
  }

  async upgradeFactory(user: User): Promise<any> {
    return await this.fetchData('/nexus/upgradefactory', user);
  }

  async upgradeStarport(user: User): Promise<any> {
    return await this.fetchData('/nexus/upgradestarport', user);
  }

  async start(user: User): Promise<any> {
    return await this.fetchData('/nexus/start', user);
  }
}
