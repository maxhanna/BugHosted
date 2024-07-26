
import { Injectable } from '@angular/core';
import { User } from './datacontracts/user/user';
import { NexusBase } from './datacontracts/nexus/nexus-base';
import { NexusBaseUpgrades } from './datacontracts/nexus/nexus-base-upgrades';
import { NexusUnitsPurchased } from './datacontracts/nexus/nexus-units-purchased';
import { NexusUnits } from './datacontracts/nexus/nexus-units';
import { UnitStats } from './datacontracts/nexus/unit-stats';
import { NexusAttackSent } from './datacontracts/nexus/nexus-attack-sent';
import { NexusAvailableUpgrades } from './datacontracts/nexus/nexus-available-upgrades';


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

  async getNexus(user: User, nexus?: NexusBase):
    Promise<{
      nexusBase: NexusBase; nexusBaseUpgrades: NexusBaseUpgrades;
      nexusUnits: NexusUnits; nexusUnitsPurchasedList: NexusUnitsPurchased[];
      nexusAttacksSent: NexusAttackSent[], nexusAttacksIncoming: NexusAttackSent[],
      miningSpeed: number, nexusAvailableUpgrades: NexusAvailableUpgrades
    } | undefined> {
    return await this.fetchData('/nexus', { User: user, Nexus: nexus });
  }

  async getMap(user: User): Promise<NexusBase[]> {
    return await this.fetchData('/nexus/getmap', user);
  }

  async upgradeCommandCenter(user: User, nexus: NexusBase): Promise<any> {
    return await this.fetchData('/nexus/upgradenexus', { User: user, Nexus: nexus });
  }

  async upgradeMines(user: User, nexus: NexusBase): Promise<any> {
    return await this.fetchData('/nexus/upgrademines', { User: user, Nexus: nexus });
  }

  async upgradeSupplyDepot(user: User, nexus: NexusBase): Promise<any> {
    return await this.fetchData('/nexus/upgradesupplydepot', { User: user, Nexus: nexus });
  }

  async upgradeFactory(user: User, nexus: NexusBase): Promise<any> {
    return await this.fetchData('/nexus/upgradefactory', { User: user, Nexus: nexus });
  }

  async upgradeStarport(user: User, nexus: NexusBase): Promise<any> {
    return await this.fetchData('/nexus/upgradestarport', { User: user, Nexus: nexus });
  }
  async upgradeEngineeringBay(user: User, nexus: NexusBase): Promise<any> {
    return await this.fetchData('/nexus/upgradeengineeringbay', { User: user, Nexus: nexus });
  }
  async upgradeWarehouse(user: User, nexus: NexusBase): Promise<any> {
    return await this.fetchData('/nexus/upgradewarehouse', { User: user, Nexus: nexus });
  }
  async start(user: User): Promise<any> {
    return await this.fetchData('/nexus/start', user);
  }
  async getMinesInfo(user: User, nexus: NexusBase): Promise<any> {
    return await this.fetchData('/nexus/getminesinfo', { User: user, Nexus: nexus });
  }
  async getBuildingUpgrades(user: User, nexus: NexusBase): Promise<any> {
    return await this.fetchData('/nexus/getbuildingupgrades', { User: user, Nexus: nexus });
  }
  async getUnitStats(user: User, nexus: NexusBase): Promise<any> {
    return await this.fetchData('/nexus/getunitstats', { User: user, Nexus: nexus });
  }
  async purchaseUnit(user: User, nexus: NexusBase, unitId: number, purchaseAmount: number): Promise<any> {
    return await this.fetchData('/nexus/purchaseUnit', { User: user, Nexus: nexus, unitId, purchaseAmount });
  }
  async engage(user: User, originNexus: NexusBase, destinationNexus: NexusBase, unitStats: UnitStats[], timeInSeconds: number): Promise<any> {
    return await this.fetchData('/nexus/engage', { User: user, OriginNexus: originNexus, DestinationNexus: destinationNexus, UnitList: unitStats, DistanceTimeInSeconds: Math.round(timeInSeconds) });
  }

  formatTimer(allSeconds?: number): string {
    if (!allSeconds) return '';
    const totalSeconds = allSeconds;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${Math.ceil(seconds)}`;
  }
}
