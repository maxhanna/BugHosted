
import { Injectable } from '@angular/core';
import { User } from './datacontracts/user/user';
import { NexusBase } from './datacontracts/nexus/nexus-base';
import { NexusBaseUpgrades } from './datacontracts/nexus/nexus-base-upgrades';
import { NexusUnitsPurchased } from './datacontracts/nexus/nexus-units-purchased';
import { NexusUnits } from './datacontracts/nexus/nexus-units';
import { UnitStats } from './datacontracts/nexus/unit-stats';
import { NexusAttackSent } from './datacontracts/nexus/nexus-attack-sent';
import { UpgradeDetail } from './datacontracts/nexus/nexus-available-upgrades';
import { NexusBattleOutcomeReports } from './datacontracts/nexus/nexus-battle-outcome-reports';
import { NexusUnitUpgrades } from './datacontracts/nexus/nexus-unit-upgrades';
import { MiningSpeed } from './datacontracts/nexus/mining-speed';


@Injectable({
  providedIn: 'root'
})
export class NexusService {

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

  async getNexus(userId: number, nexus?: NexusBase):
    Promise<{
      nexusBase: NexusBase; nexusBaseUpgrades: NexusBaseUpgrades;
      nexusUnitsPurchasedList: NexusUnitsPurchased[];
      nexusAttacksSent: NexusAttackSent[], nexusDefencesSent: NexusAttackSent[],
      nexusAttacksIncoming: NexusAttackSent[], nexusDefencesIncoming: NexusAttackSent[],
      nexusUnitUpgrades: NexusUnitUpgrades[], nexusUnits: NexusUnits
    } | undefined> {
    return await this.fetchData('/nexus', { UserId: userId, Nexus: nexus });
  }

  async getMap(): Promise<NexusBase[]> {
    return await this.fetchData('/nexus/getmap');
  }

  async refreshGoldInBackend(): Promise<void> {
    return await this.fetchData('/nexus/refreshgold');
  }

  async upgradeCommandCenter(userId: number, nexus: NexusBase): Promise<any> {
    return await this.fetchData('/nexus/upgradenexus', { UserId: userId, Nexus: nexus });
  }

  async upgradeMines(userId: number, nexus: NexusBase): Promise<any> {
    return await this.fetchData('/nexus/upgrademines', { UserId: userId, Nexus: nexus });
  }

  async upgradeSupplyDepot(userId: number, nexus: NexusBase): Promise<any> {
    return await this.fetchData('/nexus/upgradesupplydepot', { UserId: userId, Nexus: nexus });
  }

  async upgradeFactory(userId: number, nexus: NexusBase): Promise<any> {
    return await this.fetchData('/nexus/upgradefactory', { UserId: userId, Nexus: nexus });
  }

  async upgradeStarport(userId: number, nexus: NexusBase): Promise<any> {
    return await this.fetchData('/nexus/upgradestarport', { UserId: userId, Nexus: nexus });
  }
  async upgradeEngineeringBay(userId: number, nexus: NexusBase): Promise<any> {
    return await this.fetchData('/nexus/upgradeengineeringbay', { UserId: userId, Nexus: nexus });
  }
  async upgradeWarehouse(userId: number, nexus: NexusBase): Promise<any> {
    return await this.fetchData('/nexus/upgradewarehouse', { UserId: userId, Nexus: nexus });
  }
  async start(userId: number): Promise<any> {
    return await this.fetchData('/nexus/start', userId);
  }
  async getMinesInfo(nexus: NexusBase): Promise<any> {
    return await this.fetchData('/nexus/getminesinfo', { Nexus: nexus });
  }
  async getBuildingUpgrades(nexus: NexusBase): Promise<any> {
    return await this.fetchData('/nexus/getbuildingupgrades', { Nexus: nexus });
  }
  async getUnitStats(): Promise<any> {
    return await this.fetchData('/nexus/getunitstats');
  }
  async getUnitUpgradeStats(): Promise<any> {
    return await this.fetchData('/nexus/getunitupgradestats');
  }
  async purchaseUnit(userId: number, nexus: NexusBase, unitId: number, purchaseAmount: number): Promise<any> {
    return await this.fetchData('/nexus/purchaseUnit', { UserId: userId, Nexus: nexus, unitId, purchaseAmount });
  }
  async engage(originNexus: NexusBase, destinationNexus: NexusBase, unitStats: UnitStats[]): Promise<any> {
    return await this.fetchData('/nexus/engage', { OriginNexus: originNexus, DestinationNexus: destinationNexus, UnitList: unitStats });
  }
  async defend(originNexus: NexusBase, destinationNexus: NexusBase, unitStats: UnitStats[]): Promise<any> {
    return await this.fetchData('/nexus/defend', { OriginNexus: originNexus, DestinationNexus: destinationNexus, UnitList: unitStats });
  }
  async returnDefence(defenceId: number): Promise<any> {
    return await this.fetchData('/nexus/returndefence', { DefenceId: defenceId });
  }
  async returnAttack(defenceId: number): Promise<any> {
    return await this.fetchData('/nexus/returnattack', { DefenceId: defenceId });
  }
  async getBattleReports(userId: number, pageNumber: number, pageSize: number, targetBase?: NexusBase, targetUserId?: number): Promise<NexusBattleOutcomeReports> {
    return await this.fetchData('/nexus/getbattlereports', { UserId: userId, PageNumber: pageNumber, PageSize: pageSize, TargetBase: targetBase, TargetUserId: targetUserId });
  }
  async deleteReport(userId: number, battleIds?: number[]): Promise<any> {
    return await this.fetchData('/nexus/deletereport', { UserId: userId, BattleIds: battleIds });
  }
  async research(nexusBase: NexusBase, unit: UnitStats): Promise<any> {
    return await this.fetchData('/nexus/research', { NexusBase: nexusBase, Unit: unit });
  }
  async getAllBuildingUpgradesList(): Promise<UpgradeDetail[]> {
    return await this.fetchData('/nexus/getallbuildingupgradeslist', {});
  }
  async getAllBasesUnits(userId: number): Promise<NexusUnits[]> {
    return await this.fetchData('/nexus/getallbasesunits', userId);
  }
  async getMiningSpeeds(): Promise<MiningSpeed[]> {
    return await this.fetchData('/nexus/getallminingspeeds', {});
  }
  async upgradeAll(building: string, userId: number): Promise<NexusBase[]> {
    return await this.fetchData('/nexus/upgradeall', { UserId: userId, Upgrade: building });
  }
  async massPurchase(unit: string, userId: number): Promise<NexusBase[]> {
    return await this.fetchData('/nexus/masspurchase', { UserId: userId, Upgrade: unit });
  }
  async setBaseName(nexus: NexusBase, baseName: string): Promise<any> {
    return await this.fetchData('/nexus/setbasename', { Nexus: nexus, BaseName: baseName });
  }
  async updatePlayerColor(userId: number, color: string): Promise<any> {
    return await this.fetchData('/nexus/updateplayercolor', { UserId: userId, Color: color });
  }
  async getPlayerColor(userId: number): Promise<any> {
    return await this.fetchData('/nexus/getplayercolor', userId);
  }
  async getNumberOfBases(userId: number): Promise<any> {
    return await this.fetchData('/nexus/getnumberofbases', userId);
  }


  formatTimer(allSeconds?: number): string {
    if (!allSeconds && allSeconds !== 0) return '';

    const totalSeconds = allSeconds;

    const days = Math.floor(totalSeconds / (24 * 3600));
    const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    const timeParts: string[] = [];

    if (days > 0) timeParts.push(`${days}d`);
    if (hours > 0 || days > 0) timeParts.push(`${hours}`);
    timeParts.push(`${String(minutes).padStart(2, '0')}`);
    timeParts.push(`${String(seconds).padStart(2, '0')}`);

    return timeParts.join(':');
  }


}
