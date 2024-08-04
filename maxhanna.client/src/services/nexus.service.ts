
import { Injectable } from '@angular/core';
import { User } from './datacontracts/user/user';
import { NexusBase } from './datacontracts/nexus/nexus-base';
import { NexusBaseUpgrades } from './datacontracts/nexus/nexus-base-upgrades';
import { NexusUnitsPurchased } from './datacontracts/nexus/nexus-units-purchased';
import { NexusUnits } from './datacontracts/nexus/nexus-units';
import { UnitStats } from './datacontracts/nexus/unit-stats';
import { NexusAttackSent } from './datacontracts/nexus/nexus-attack-sent';
import { NexusAvailableUpgrades, UpgradeDetail } from './datacontracts/nexus/nexus-available-upgrades';
import { NexusBattleOutcome } from './datacontracts/nexus/nexus-battle-outcome';
import { NexusBattleOutcomeReports } from './datacontracts/nexus/nexus-battle-outcome-reports';
import { NexusUnitUpgrades } from './datacontracts/nexus/nexus-unit-upgrades';
import { MiningSpeed } from './datacontracts/nexus/mining-speed';


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
      nexusUnitUpgrades: NexusUnitUpgrades[]
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
  async getUnitUpgradeStats(user: User): Promise<any> {
    return await this.fetchData('/nexus/getunitupgradestats', { User: user });
  }
  async purchaseUnit(user: User, nexus: NexusBase, unitId: number, purchaseAmount: number): Promise<any> {
    return await this.fetchData('/nexus/purchaseUnit', { User: user, Nexus: nexus, unitId, purchaseAmount });
  }
  async engage(user: User, originNexus: NexusBase, destinationNexus: NexusBase, unitStats: UnitStats[], timeInSeconds: number): Promise<any> {
    return await this.fetchData('/nexus/engage', { User: user, OriginNexus: originNexus, DestinationNexus: destinationNexus, UnitList: unitStats, DistanceTimeInSeconds: Math.round(timeInSeconds) });
  }
  async getBattleReports(user: User, pageNumber: number, pageSize: number, targetBase?: NexusBase): Promise<NexusBattleOutcomeReports> {
    return await this.fetchData('/nexus/getbattlereports', { User: user, PageNumber: pageNumber, PageSize: pageSize, TargetBase: targetBase });
  }
  async deleteReport(user: User, battleId: number): Promise<any> {
    return await this.fetchData('/nexus/deletereport', { User: user, BattleId: battleId });
  }
  async research(user: User, nexusBase: NexusBase, unit: UnitStats): Promise<any> {
    return await this.fetchData('/nexus/research', { User: user, NexusBase: nexusBase, Unit: unit });
  }
  async getAllBuildingUpgradesList(): Promise<UpgradeDetail[]> {
    return await this.fetchData('/nexus/getallbuildingupgradeslist', {});
  }
  async getMiningSpeeds(): Promise<MiningSpeed[]> {
    return await this.fetchData('/nexus/getallminingspeeds', {});
  }


  formatTimer(allSeconds?: number): string {
    if (!allSeconds && allSeconds !== 0) return '';

    const totalSeconds = allSeconds;

    const days = Math.floor(totalSeconds / (24 * 3600));
    const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    const timeParts: string[] = [];

    if (days > 0) timeParts.push(`${days}d`); // Append 'd' for days
    if (hours > 0 || days > 0) timeParts.push(`${hours}h`); // Append 'h' for hours
    timeParts.push(`${minutes}m`); // Append 'm' for minutes
    timeParts.push(`${seconds}s`); // Append 's' for seconds

    return timeParts.join(' '); // Join with a space for better readability
  }


}
