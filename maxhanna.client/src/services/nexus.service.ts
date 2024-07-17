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
      console.error(error);
    }
  }

  async getNexus(user: User, nexus?: NexusBase): Promise<{ nexusBase: NexusBase, nexusBaseUpgrades: NexusBaseUpgrades } | undefined> {
    return await this.fetchData('/nexus', { user, nexus });
  }

  async getMap(user: User): Promise<NexusBase[]> {
    return await this.fetchData('/nexus/getmap', user);
  }

  async upgradeCommandCenter(user: User, nexus: NexusBase): Promise<any> {
    return await this.fetchData('/nexus/upgradenexus', { user, nexus });
  }

  async upgradeMines(user: User, nexus: NexusBase): Promise<any> {
    return await this.fetchData('/nexus/upgrademines', { user, nexus });
  }

  async upgradeSupplyDepot(user: User, nexus: NexusBase): Promise<any> {
    return await this.fetchData('/nexus/upgradesupplydepot', { user, nexus });
  }

  async upgradeFactory(user: User, nexus: NexusBase): Promise<any> {
    return await this.fetchData('/nexus/upgradefactory', { user, nexus });
  }

  async upgradeStarport(user: User, nexus: NexusBase): Promise<any> {
    return await this.fetchData('/nexus/upgradestarport', { user, nexus });
  }

  async start(user: User): Promise<any> {
    return await this.fetchData('/nexus/start', user);
  }
  async getMinesInfo(user: User, nexus: NexusBase): Promise<any> {
    return await this.fetchData('/nexus/getminesinfo', { user, nexus });
  }
  async getBuildingUpgrades(user: User, nexus: NexusBase): Promise<any> {
    return await this.fetchData('/nexus/getbuildingupgrades', { user, nexus });
  }
}
