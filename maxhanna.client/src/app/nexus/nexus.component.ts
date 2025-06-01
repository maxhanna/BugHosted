import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { AttackEventPayload } from '../../services/datacontracts/nexus/attack-event-payload';
import { MiningSpeed } from '../../services/datacontracts/nexus/mining-speed';
import { NexusAttackSent } from '../../services/datacontracts/nexus/nexus-attack-sent';
import { UpgradeDetail } from '../../services/datacontracts/nexus/nexus-available-upgrades';
import { NexusBase } from '../../services/datacontracts/nexus/nexus-base';
import { NexusBaseUpgrades } from '../../services/datacontracts/nexus/nexus-base-upgrades';
import { NexusTimer } from '../../services/datacontracts/nexus/nexus-timer';
import { NexusUnitUpgrades } from '../../services/datacontracts/nexus/nexus-unit-upgrades';
import { NexusUnits } from '../../services/datacontracts/nexus/nexus-units';
import { NexusUnitsPurchased } from '../../services/datacontracts/nexus/nexus-units-purchased';
import { UnitStats } from '../../services/datacontracts/nexus/unit-stats';
import { UnitUpgradeStats } from '../../services/datacontracts/nexus/unit-upgrade-stats';
import { User } from '../../services/datacontracts/user/user';
import { FileService } from '../../services/file.service';
import { NexusService } from '../../services/nexus.service';
import { ChildComponent } from '../child.component';
import { NexusMapComponent } from '../nexus-map/nexus-map.component';
import { NexusBasesComponent } from '../nexus-bases/nexus-bases.component';
import { NexusReportsComponent } from '../nexus-reports/nexus-reports.component';

@Component({
    selector: 'app-nexus',
    templateUrl: './nexus.component.html',
    styleUrl: './nexus.component.css',
    standalone: false
})
export class NexusComponent extends ChildComponent implements OnInit, OnDestroy {
  serverDown? = false;
  notifications: string[] = [];
  isUserComponentOpen = true;
  isCommandCenterOpen = false;
  isMinesOpen = false;
  isEngineeringBayOpen = false;
  isWarehouseOpen = false;
  isFactoryOpen = false;
  isStarportOpen = false;
  isSupplyDepotOpen = false;
  isMapOpen = false;
  isBasesOpen = false;
  isSupportOpen = false;
  isReportsOpen = false;
  isMarineOpen = false;
  isGoliathOpen = false;
  isSiegeTankOpen = false;
  isScoutOpen = false;
  isWraithOpen = false;
  isBattlecruiserOpen = false;
  isGlitcherOpen = false;
  isUserNew = false;
  displayCommandCenter = false;
  displayMines = false;
  displayFactory = false;
  displayStarport = false;
  displaySupplyDepot = false;
  displayWarehouse = false;
  displayEngineeringBay = false;
  showMoreWarehouseInfo = false;
  showMoreFactoryInfo = false;
  showMoreStarportInfo = false;
  showMoreEngineeringBayInfo = false;
  isUpgradingUnits = false;
  preventMapScrolling = false;
  shouldLoadMap = false;
  shouldLoadBaseUnits = false;
  hideBaseNavForMap = false;

  mapTileSrc?: string;
  mapTileSrc2?: string;
  mapTileSrc3?: string;
  nexusLevel1Src?: string;
  nexusLevel2Src?: string;
  nexusLevel3Src?: string;
  nexusBackgroundPictureSrc?: string;
  commandCenterPictureSrc?: string;
  starportPictureSrc?: string;
  supplyDepotPictureSrc?: string;
  warehousePictureSrc?: string;
  engineeringBayPictureSrc?: string;
  minesPictureSrc?: string;
  factoryPictureSrc?: string;

  currentSupplyDepotSrc?: string;
  currentCommandCenterSrc?: string;
  currentWarehouseSrc?: string;
  currentEngineeringBaySrc?: string;
  currentFactorySrc?: string;
  currentStarportSrc?: string;
  currentMinesSrc?: string;

  cclvl1Src?: string;
  cclvl2Src?: string;
  cclvl3Src?: string;
  splvl1Src?: string;
  splvl2Src?: string;
  splvl3Src?: string;
  sdlvl1Src?: string;
  sdlvl2Src?: string;
  sdlvl3Src?: string;
  whlvl1Src?: string;
  whlvl2Src?: string;
  whlvl3Src?: string;
  eblvl1Src?: string;
  eblvl2Src?: string;
  eblvl3Src?: string;
  mineslvl1Src?: string;
  mineslvl2Src?: string;
  mineslvl3Src?: string;
  flvl1Src?: string;
  flvl2Src?: string;
  flvl3Src?: string;

  marinePictureSrc?: string;
  goliathPictureSrc?: string;
  siegeTankPictureSrc?: string;
  scoutPictureSrc?: string;
  wraithPictureSrc?: string;
  battlecruiserPictureSrc?: string;
  glitcherPictureSrc?: string;

  mapData?: NexusBase[] = undefined;
  currentPersonalBases?: NexusBase[] = undefined;
  nexusBase?: NexusBase;
  nexusBaseUpgrades?: NexusBaseUpgrades;
  allNexusUnits?: NexusUnits[];
  nexusUnits?: NexusUnits;
  nexusAvailableUnits?: NexusUnits;
  nexusExternalSupportUnits?: NexusUnits;
  nexusUnitsOutsideOfBase?: NexusUnits;
  nexusUnitsPurchaseList?: NexusUnitsPurchased[];
  nexusUnitUpgrades?: NexusUnitUpgrades[];
  nexusAvailableUpgrades?: UpgradeDetail[];
  currentValidAvailableUpgrades?: UpgradeDetail[];
  nexusAttacksSent?: NexusAttackSent[];
  nexusDefencesSent?: NexusAttackSent[];
  nexusAttacksIncoming?: NexusAttackSent[];
  nexusDefencesIncoming?: NexusAttackSent[];
  units?: UnitStats[];
  unitUpgradeStats?: UnitUpgradeStats[];
  miningSpeeds?: MiningSpeed[];

  buildingTimers: { [key: string]: NexusTimer } = {};
  unitTimers: { [key: string]: NexusTimer } = {};
  attackTimers: { [key: string]: NexusTimer } = {};
  defenceTimers: { [key: string]: NexusTimer } = {};
  researchTimers: { [key: string]: NexusTimer } = {};
  goldIncrementInterval: any;
  private loadMapCounter: any;
  private loadBaseUnitsCounter: any;

  supplyUsedPercentage = 0;
  attacksIncomingCount = 0;
  defencesIncomingCount = 0;
  numberOfPersonalBases = 0;
  miningSpeed = 0.0;
  goldCapacity = 5000;
  supplyCapacity = 2500;
  factoryUnitsBeingBuilt = 0;
  starportUnitsBeingBuilt = 0;
  glitchersBeingBuilt = 0;
  baseSwitchCount = 0;
  factoryUnitIds = [6, 7, 10];
  starportUnitIds = [8, 9, 11];
  warehouseUpgradeLevels: number[] = [];
  glitcherStats = new UnitStats();
  toggledUnitStat?: UnitStats;
  unitsWithoutGlitcher?: UnitStats[];
  mineSmokeContainers = [1, 2, 3];
  mineSmokeContainersLis = new Array(9);
  randomMineSmokeContainersBooleans: boolean[] = [];
  isUserSearchOpen = false;

  private unitTypeMap = new Map<string, number>([
    ["marine", 6],
    ["goliath", 7],
    ["battlecruiser", 8],
    ["wraith", 9],
    ["siege_tank", 10],
    ["scout", 11],
    ["glitcher", 12],
  ]);

  playerColor = "chartreuse";
  playerColors: { [key: number]: string } = [];

  @ViewChild('upgradeMineButton') upgradeMineButton!: ElementRef<HTMLButtonElement>;
  @ViewChild('upgradeFactoryButton') upgradeFactoryButton!: ElementRef<HTMLButtonElement>;
  @ViewChild('baseNameInput') baseNameInput!: ElementRef<HTMLInputElement>;
  @ViewChild('playerColorInput') playerColorInput!: ElementRef<HTMLInputElement>;
  @ViewChild('mapComponentDiv') mapComponentDiv!: ElementRef<HTMLDivElement>;
  @ViewChild(NexusMapComponent) mapComponent!: NexusMapComponent;
  @ViewChild(NexusBasesComponent) nexusBasesComponent!: NexusBasesComponent;
  @ViewChild(NexusReportsComponent) nexusReportsComponent!: NexusReportsComponent;

  constructor(private fileService: FileService, private nexusService: NexusService) {
    super();
  }

  async ngOnInit() { 
    this.serverDown = (this.parentRef ? await this.parentRef?.isServerUp() <= 0 : false);
    this.isUserNew = true;
    this.isUserComponentOpen = (!this.parentRef?.user || this.parentRef.user.id == 0);
    this.warehouseUpgradeLevels = Array.from({ length: 6 }, (_, i) => i + 1);

    const sessionToken = await this.parentRef?.getSessionToken() ?? "";
    this.loadPictureSrcs(sessionToken);
    this.nexusService.getPlayerColor(this.parentRef?.user?.id ?? 0).then(res => {
      this.playerColors = res;
      if (res[this.parentRef?.user?.id ?? 0]) {
        this.playerColor = res[this.parentRef?.user?.id ?? 0];
      } 
    });
    this.loadNexusData();
  }

  ngOnDestroy() {
    this.stopGoldIncrement();
  }

  async start() {
    if (!this.parentRef?.user?.id) { return alert("You must be logged in to play!"); }
    const startRes = await this.nexusService.start(this.parentRef.user.id);

    if (startRes) {
      if (this.nexusBase) {
        this.nexusBase.coordsX = startRes.x;
        this.nexusBase.coordsY = startRes.y;
        this.nexusBase.gold = 200;
      }
      this.isUserNew = false;
      await this.loadNexusData();
    }
  }
  async loadNexusData() {
    if (!this.parentRef?.user?.id) return;

    this.startLoading();
    this.unitsWithoutGlitcher = undefined;
    try {
      await this.nexusService.getNexus(this.parentRef.user.id, this.nexusBase).then(async data => {
        if (data && data.nexusBase) {
          // Set basic data
          this.nexusBase = data.nexusBase;
          this.nexusBaseUpgrades = data.nexusBaseUpgrades;
          this.nexusUnitsPurchaseList = data.nexusUnitsPurchasedList;
          this.nexusAttacksSent = data.nexusAttacksSent;
          this.nexusDefencesSent = data.nexusDefencesSent;
          this.nexusUnitUpgrades = data.nexusUnitUpgrades;
          this.nexusAttacksIncoming = data.nexusAttacksIncoming;
          this.nexusDefencesIncoming = data.nexusDefencesIncoming;
          this.nexusUnits = data.nexusUnits;

          await this.getNexusUnits();
          this.fetchMapData();

          if (!this.isMapOpen) {
            this.goldCapacity = (data.nexusBase.warehouseLevel + 1) * 5000;
            this.supplyCapacity = data.nexusBase.supplyDepotLevel * 2500;
            this.supplyUsedPercentage = (data.nexusBase.supply / this.supplyCapacity) * 100;

            this.currentValidAvailableUpgrades = undefined;
            this.displayBuildings(data.nexusBaseUpgrades);
            this.getUnitStats();
            this.updateUnitResearchTimers();
            this.getAvailableBuildingUpgrades();
            this.getMiningSpeedsAndSetMiningSpeed();
            this.fixMapDataGold();
            this.fixMinesSmoke();
            this.isUserNew = false;
            this.isUserComponentOpen = false;
          }

          this.startLoadMapCounter();
          this.startLoadBaseUnitsCounter();
          this.stopLoading();
        } else {
          this.stopLoading();
        }
      });
    } catch (ex) {
      this.addNotification((ex as Error).message);
      console.log(ex);
      this.stopLoading();
    }
    return this.nexusAvailableUnits;
  }

  private startLoadCounter(flag: boolean, durationInMinutes: number, counterType: 'Map' | 'BaseUnits'): void { 
    if (!flag && !this[`load${counterType}Counter`]) { 
      this[`load${counterType}Counter`] = setInterval(() => {
        this[`shouldLoad${counterType}`] = true;
      }, durationInMinutes * 60 * 1000);
    }
  }

  private startLoadMapCounter(): void {
    this.startLoadCounter(this.shouldLoadMap, 10, 'Map');
  }

  private startLoadBaseUnitsCounter(): void {
    this.startLoadCounter(this.shouldLoadBaseUnits, 3, 'BaseUnits');
  }


  getBaseNameForCoords(x?: number, y?: number) {
    if (!x || !y) return '';
    return this.currentPersonalBases?.find(base => base.coordsX == x && base.coordsY == y)?.baseName ?? '';
  }

  fixMapDataGold() {
    const targetMapData = this.currentPersonalBases?.find(x => x.coordsX == this.nexusBase?.coordsX && x.coordsY == this.nexusBase?.coordsY);
    if (targetMapData && this.nexusBase) {
      targetMapData.gold = this.nexusBase.gold;
    }
  }
  fixMinesSmoke() {
    this.mineSmokeContainers = (this.nexusBase?.minesLevel ?? 0) < 3 ? [2] : [1, 2, 3];
    this.randomMineSmokeContainersBooleans = [...Array(5).fill(false), ...Array(3).fill(true)].sort(() => Math.random() - 0.5);
  }
  private hasAnyUnits(units: NexusUnits): boolean {
    return units.marineTotal > 0 || units.siegeTankTotal > 0 || units.goliathTotal > 0 ||
      units.scoutTotal > 0 || units.wraithTotal > 0 || units.battlecruiserTotal > 0 || units.glitcherTotal > 0;
  }

  private cleanupUnits() {
    if (this.nexusUnitsOutsideOfBase && !this.hasAnyUnits(this.nexusUnitsOutsideOfBase)) {
      this.nexusUnitsOutsideOfBase = undefined;
    }
    if (this.nexusAvailableUnits && !this.hasAnyUnits(this.nexusAvailableUnits)) {
      this.nexusAvailableUnits = undefined;
    }
    if (this.nexusExternalSupportUnits && !this.hasAnyUnits(this.nexusExternalSupportUnits)) {
      this.nexusExternalSupportUnits = undefined;
    }
  }

  private adjustUnitTotals(units: NexusUnits, attack: NexusAttackSent) {
    units.marineTotal -= (attack.marineTotal ?? 0);
    units.goliathTotal -= (attack.goliathTotal ?? 0);
    units.siegeTankTotal -= (attack.siegeTankTotal ?? 0);
    units.scoutTotal -= (attack.scoutTotal ?? 0);
    units.wraithTotal -= (attack.wraithTotal ?? 0);
    units.battlecruiserTotal -= (attack.battlecruiserTotal ?? 0);
    units.glitcherTotal -= (attack.glitcherTotal ?? 0);
  }
  private addUnitTotals(units: NexusUnits, attack: NexusAttackSent) {
    units.marineTotal += (attack.marineTotal ?? 0);
    units.goliathTotal += (attack.goliathTotal ?? 0);
    units.siegeTankTotal += (attack.siegeTankTotal ?? 0);
    units.scoutTotal += (attack.scoutTotal ?? 0);
    units.wraithTotal += (attack.wraithTotal ?? 0);
    units.battlecruiserTotal += (attack.battlecruiserTotal ?? 0);
    units.glitcherTotal += (attack.glitcherTotal ?? 0);
  }

  async getMiningSpeedsAndSetMiningSpeed() {
    if (!this.miningSpeeds) {
      this.nexusService.getMiningSpeeds().then(res => {
        this.miningSpeeds = res;
        if (this.miningSpeeds) {
          this.miningSpeed = this.miningSpeeds.find(x => x.minesLevel == this.nexusBase?.minesLevel)?.speed ?? 0;
        }
      });
    }

    if (this.miningSpeeds) {
      this.miningSpeed = this.miningSpeeds.find(x => x.minesLevel == this.nexusBase?.minesLevel)?.speed ?? 0;
    }

    this.startGoldIncrement();
  }
  async getNexusUnits() {
    const previousAttackTimers = { ...this.attackTimers };
    const previousDefenceTimers = { ...this.defenceTimers };

    if ((!this.allNexusUnits || this.shouldLoadBaseUnits) && !this.isMapOpen && this.parentRef?.user?.id) {
      this.shouldLoadBaseUnits = false;
      await this.nexusService.getAllBasesUnits(this.parentRef.user.id).then(res => {
        this.allNexusUnits = res;
      });
    }

    this.reinitializeByType("nexusAvailableUnits");
    this.reinitializeByType("nexusUnitsOutsideOfBase");
    this.reinitializeByType("nexusExternalSupportUnits");

    this.nexusAvailableUnits = this.nexusUnits && this.hasAnyUnits(this.nexusUnits) ? { ...this.nexusUnits } : undefined;

    const utcNow = new Date().getTime();
    const uniqueAttacks = new Set<number>(); 
    this.nexusAttacksSent?.filter(attack => (attack.originCoordsX === this.nexusBase?.coordsX && attack.originCoordsY === this.nexusBase.coordsY)).forEach((attack, index) => { 
      this.adjustUnitTotals(this.nexusAvailableUnits!, attack);
      this.addUnitTotals(this.nexusUnitsOutsideOfBase!, attack);

      if (!this.isMapOpen) { 
        const startTime = new Date(attack.timestamp).getTime();
        const elapsedTimeInSeconds = Math.floor((utcNow - startTime) / 1000);
        const remainingTimeInSeconds = attack.duration - elapsedTimeInSeconds;
        const coordsMatchOwnBase = (attack.destinationCoordsX === this.nexusBase?.coordsX && attack.destinationCoordsY === this.nexusBase?.coordsY);
        const salt = `${index + 1}. ${coordsMatchOwnBase ? "Returning" : "Attacking"} ${!coordsMatchOwnBase ? `{${attack.destinationCoordsX},${attack.destinationCoordsY}} ${this.getBaseNameForCoords(attack.destinationCoordsX, attack.destinationCoordsY)}` : ''}`;

        if (previousAttackTimers[salt]) { 
          const existingTimer = previousAttackTimers[salt];
          if (existingTimer.endTime !== remainingTimeInSeconds) {
            existingTimer.endTime = remainingTimeInSeconds;
          }
          delete previousAttackTimers[salt];
        } else if (!uniqueAttacks.has(attack.id)) {
          uniqueAttacks.add(attack.id);
          this.startAttackTimer(salt, remainingTimeInSeconds, attack);
        }
      } 
    });

    this.attacksIncomingCount = 0; 
    this.nexusAttacksIncoming?.forEach(attack => {
      if (!(attack.originCoordsX == attack.destinationCoordsX && attack.originCoordsY == attack.destinationCoordsY)) {
        this.attacksIncomingCount++;
      }
      if (attack.originCoordsX === this.nexusBase?.coordsX && attack.originCoordsY === this.nexusBase.coordsY) {
        this.adjustUnitTotals(this.nexusAvailableUnits!, attack);
      } else if (attack.originCoordsX !== attack.destinationCoordsX || attack.originCoordsY !== attack.destinationCoordsY) {
        if (!this.isMapOpen) {  
          if ((attack.destinationCoordsX === this.nexusBase?.coordsX && attack.destinationCoordsY === this.nexusBase?.coordsY)) {
            const startTime = new Date(attack.timestamp).getTime();
            const elapsedTimeInSeconds = Math.floor((utcNow - startTime) / 1000);
            const remainingTimeInSeconds = attack.duration - elapsedTimeInSeconds;
            const salt = `${this.attacksIncomingCount + 1}. Attack from {${attack.originCoordsX},${attack.originCoordsY}} ${this.getBaseNameForCoords(attack.originCoordsX, attack.originCoordsY)}`;

            if (previousAttackTimers[salt]) {
              const existingTimer = previousAttackTimers[salt];
              if (existingTimer.endTime !== remainingTimeInSeconds) {
                existingTimer.endTime = remainingTimeInSeconds;
              }
              delete previousAttackTimers[salt];
            } else if (!uniqueAttacks.has(attack.id)) {
              uniqueAttacks.add(attack.id); 
              this.startDefenceTimer(salt, remainingTimeInSeconds, attack);
            }
          }
        }
      }
    });

    let defenceCount = 0;
    this.defencesIncomingCount = 0; 
    this.nexusDefencesIncoming?.forEach(defence => {

      if (!defence.arrived && !(defence.originCoordsX == defence.destinationCoordsX && defence.originCoordsY == defence.destinationCoordsY)) {
        this.defencesIncomingCount++;
      }
      if (!defence.arrived && defence.destinationCoordsX === this.nexusBase?.coordsX && defence.destinationCoordsY === this.nexusBase?.coordsY && !this.isMapOpen) {
        const startTime = new Date(defence.timestamp).getTime();
        const elapsedTimeInSeconds = Math.floor((utcNow - startTime) / 1000);
        const remainingTimeInSeconds = defence.duration - elapsedTimeInSeconds;
        let salt = "";
        if (defence.originCoordsX == defence.destinationCoordsX && defence.originCoordsY == defence.destinationCoordsY) {
          salt = `${++defenceCount}.{${defence.originCoordsX},${defence.originCoordsY}} ${this.getBaseNameForCoords(defence.originCoordsX, defence.originCoordsY)} Returning`;
        } else {
          salt = `${++defenceCount}. Support from {${defence.originCoordsX},${defence.originCoordsY}} ${this.getBaseNameForCoords(defence.originCoordsX, defence.originCoordsY)}`;
        }

        if (previousDefenceTimers[salt]) {
          const existingTimer = previousDefenceTimers[salt];
          if (existingTimer.endTime !== remainingTimeInSeconds) {
            existingTimer.endTime = remainingTimeInSeconds;
          }
          delete previousDefenceTimers[salt];
        } else {
          this.startDefenceTimer(salt, remainingTimeInSeconds, defence);
        }
      }
      if (defence.arrived && defence.destinationCoordsX === this.nexusBase?.coordsX && defence.destinationCoordsY === this.nexusBase?.coordsY) {
        this.addUnitTotals(this.nexusExternalSupportUnits!, defence);
      }
    });

    defenceCount = 0; 
    this.nexusDefencesSent?.forEach(defence => {
      if (defence.originCoordsX === this.nexusBase?.coordsX && defence.originCoordsY === this.nexusBase?.coordsY) {
        if (this.nexusAvailableUnits) {
          this.adjustUnitTotals(this.nexusAvailableUnits!, defence);
        }
        this.addUnitTotals(this.nexusUnitsOutsideOfBase!, defence);
      }
      if (!defence.arrived && defence.originCoordsX === this.nexusBase?.coordsX && defence.originCoordsY === this.nexusBase.coordsY && !this.isMapOpen) {
        const startTime = new Date(defence.timestamp).getTime();
        const elapsedTimeInSeconds = Math.floor((utcNow - startTime) / 1000);
        const remainingTimeInSeconds = defence.duration - elapsedTimeInSeconds;

        let salt = "";
        if (defence.originCoordsX == defence.destinationCoordsX && defence.originCoordsY == defence.destinationCoordsY) {
        } else {
          salt = `${++defenceCount}. Supporting {${defence.destinationCoordsX},${defence.destinationCoordsY}} ${this.getBaseNameForCoords(defence.destinationCoordsX, defence.destinationCoordsY)}`;

          if (previousDefenceTimers[salt]) {
            const existingTimer = previousDefenceTimers[salt];
            if (existingTimer.endTime !== remainingTimeInSeconds) {
              existingTimer.endTime = remainingTimeInSeconds;
            }
            delete previousDefenceTimers[salt];
          } else {
            this.startDefenceTimer(salt, remainingTimeInSeconds, defence);
          }
        }
      }
    });

    // Clear any outdated timers that weren't updated
    Object.keys(previousAttackTimers).forEach(salt => {
      if (previousAttackTimers[salt].endTime <= 0) {
        this.clearTimer(previousAttackTimers[salt]);
        delete this.attackTimers[salt];
      }
    });

    Object.keys(previousDefenceTimers).forEach(salt => {
      if (previousDefenceTimers[salt].endTime <= 0) {
        this.clearTimer(previousDefenceTimers[salt]);
        delete this.defenceTimers[salt];
      }
    });

    this.cleanupUnits();
  }

  clearTimer(timer: NexusTimer) { 
    clearTimeout(timer.timeout);
    clearInterval(timer.interval);
  }

  async getAvailableBuildingUpgrades() {
    if (!this.nexusAvailableUpgrades) {
      const res = await this.nexusService.getAllBuildingUpgradesList();
      if (res) {
        this.nexusAvailableUpgrades = res;
      }
    }
    this.getBuildingUpgradesInfo();
  }
  async navigateBase(forward: boolean, withUnits = false, singleThread = false) {
    const userId = this.parentRef?.user?.id;
    if (!this.currentPersonalBases || !userId || !this.nexusBase) return;

    const mapLength = this.currentPersonalBases.length;
    let nextBase = null;
    let startIndex = -1;

    for (let i = 0; i < mapLength; i++) {
      const index = forward ? i : mapLength - 1 - i;
      const base = this.currentPersonalBases[index];

      if (base.coordsX === this.nexusBase.coordsX && base.coordsY === this.nexusBase.coordsY) {
        startIndex = index;
        break;
      }
    }

    if (startIndex === -1) return; // Current base not found

    for (let i = 1; i <= mapLength; i++) {
      const index = forward
        ? (startIndex + i) % mapLength
        : (startIndex - i + mapLength) % mapLength;

      const base = this.currentPersonalBases[index];

      if (base.user?.id === userId) {
        if (withUnits) {
          console.log("switching to next base with units");
          const baseUnits = this.allNexusUnits?.find(x => x.coordsX == base.coordsX && x.coordsY == base.coordsY);
          if (baseUnits && this.hasAnyUnits(baseUnits)) {
            nextBase = base;
            break;
          }
        } else { 
          nextBase = base;
          break;
        }
      }
    }

    if (nextBase) {
      this.nexusBase = nextBase;
      this.nexusUnits = undefined;
      let units = await this.loadNexusData(); 
      let maxAttempts = this.currentPersonalBases.length;
      while (withUnits && (!units || !this.hasAnyUnits(units)) && !singleThread) { 
        await this.navigateBase(forward, withUnits, true);
        units = await this.loadNexusData();
        maxAttempts--;
        if (maxAttempts == 0) {
          this.parentRef?.showNotification("No bases found with units.");
          break;
        }
      } 
    } 
  }


  async nextBase() {
    await this.navigateBase(true);
  }

  async previousBase() {
    await this.navigateBase(false);
  }

  async nextBaseWithUnits() {
    await this.navigateBase(true, true);
  }

  async previousBaseWithUnits() {
    await this.navigateBase(false, true);
  }

  reinitializeByType(type: string) {
    if (this.nexusBase) {
      if (type == "nexusAvailableUnits") {
        return this.nexusAvailableUnits = {
          coordsX: this.nexusBase.coordsX,
          coordsY: this.nexusBase.coordsY,
          marineTotal: 0,
          goliathTotal: 0,
          siegeTankTotal: 0,
          scoutTotal: 0,
          wraithTotal: 0,
          battlecruiserTotal: 0,
          glitcherTotal: 0
        } as NexusUnits;

      }
      else if (type == "nexusUnitsOutsideOfBase") {
        return this.nexusUnitsOutsideOfBase = {
          coordsX: this.nexusBase.coordsX,
          coordsY: this.nexusBase.coordsY,
          marineTotal: 0,
          goliathTotal: 0,
          siegeTankTotal: 0,
          scoutTotal: 0,
          wraithTotal: 0,
          battlecruiserTotal: 0,
          glitcherTotal: 0
        } as NexusUnits;
      }
      else if (type == "nexusExternalSupportUnits") {
        return this.nexusExternalSupportUnits = {
          coordsX: this.nexusBase.coordsX,
          coordsY: this.nexusBase.coordsY,
          marineTotal: 0,
          goliathTotal: 0,
          siegeTankTotal: 0,
          scoutTotal: 0,
          wraithTotal: 0,
          battlecruiserTotal: 0,
          glitcherTotal: 0
        } as NexusUnits;
      }
      else if (type == "nexusUnits") {
        return this.nexusUnits = {
          coordsX: this.nexusBase.coordsX,
          coordsY: this.nexusBase.coordsY,
          marineTotal: 0,
          goliathTotal: 0,
          siegeTankTotal: 0,
          scoutTotal: 0,
          wraithTotal: 0,
          battlecruiserTotal: 0,
          glitcherTotal: 0
        } as NexusUnits;
      }
      else if (type == "nexusBaseUpgrades") {
        if (!this.nexusBaseUpgrades) {
          this.nexusBaseUpgrades = {
            commandCenterUpgraded: undefined,
            supplyDepotUpgraded: undefined,
            warehouseUpgraded: undefined,
            engineeringBayUpgraded: undefined,
            factoryUpgraded: undefined,
            starportUpgraded: undefined,
            minesUpgraded: undefined,
          } as NexusBaseUpgrades;
        }
      }
    }
    return;
  }

  reinitializeNexusUnitsByTypeForUnitTimers(type: string, unit?: string, qty?: string, noCommit?: boolean) {
    if (type == "nexusAvailableUnits") {
      if (noCommit && this.nexusBase) {
        return {
          coordsX: this.nexusBase.coordsX,
          coordsY: this.nexusBase.coordsY,
          marineTotal: (unit == "marine" && qty ? parseInt(qty) : 0),
          goliathTotal: (unit == "goliath" && qty ? parseInt(qty) : 0),
          siegeTankTotal: (unit == "siege_tank" && qty ? parseInt(qty) : 0),
          scoutTotal: (unit == "scout" && qty ? parseInt(qty) : 0),
          wraithTotal: (unit == "wraith" && qty ? parseInt(qty) : 0),
          battlecruiserTotal: (unit == "battlecruiser" && qty ? parseInt(qty) : 0),
          glitcherTotal: (unit == "glitcher" && qty ? parseInt(qty) : 0)
        } as NexusUnits;
      }
    }
    return;
  }

  private async getUnitStats(force?: boolean) { 
    if (!this.units) {
      this.units = await this.nexusService.getUnitStats();
      this.glitcherStats = this.units?.find(x => x.unitType == "glitcher") ?? new UnitStats();
      this.assignPicturesToUnitStats();
    }
    this.units?.forEach(x => {
      if (this.nexusBase) {
        x.unitLevel = (x.unitType == "marine" ? this.nexusBase.marineLevel : x.unitType == "goliath" ? this.nexusBase.goliathLevel : x.unitType == "siege_tank"
          ? this.nexusBase.siegeTankLevel : x.unitType == "scout" ? this.nexusBase.scoutLevel : x.unitType == "wraith"
            ? this.nexusBase.wraithLevel : x.unitType == "battlecruiser" ? this.nexusBase.battlecruiserLevel : this.nexusBase.glitcherLevel);
      }
    });
    this.getUnitTimers();
  }

  private assignPicturesToUnitStats() {
    const unitTypes = [
      { type: "marine", pictureSrc: this.marinePictureSrc },
      { type: "goliath", pictureSrc: this.goliathPictureSrc },
      { type: "siege_tank", pictureSrc: this.siegeTankPictureSrc },
      { type: "scout", pictureSrc: this.scoutPictureSrc },
      { type: "wraith", pictureSrc: this.wraithPictureSrc },
      { type: "battlecruiser", pictureSrc: this.battlecruiserPictureSrc },
      { type: "glitcher", pictureSrc: this.glitcherPictureSrc },
    ];

    unitTypes.forEach(({ type, pictureSrc }) => {
      const unit = this.units?.find(x => x.unitType === type);
      if (unit) {
        unit.pictureSrc = pictureSrc;
      }
    });
  }

  private getUnitTimers() {
    this.reinitializeUnitTimers();

    this.factoryUnitsBeingBuilt = 0;
    this.starportUnitsBeingBuilt = 0;
    this.glitchersBeingBuilt = 0;
    if (!this.nexusUnitsPurchaseList || this.nexusUnitsPurchaseList.length === 0) {
      return;
    }

    const { coordsX, coordsY } = this.nexusBase || {};
    this.nexusUnitsPurchaseList?.forEach((purchase, index) => {
      const startTime = purchase.timestamp;
      const salt = `${index + 1}.{${coordsX} ${coordsY}} ${this.getBaseNameForCoords(coordsX, coordsY)} ${purchase.quantityPurchased} `;
      if (new Set(this.factoryUnitIds).has(purchase.unitIdPurchased)) {
        this.factoryUnitsBeingBuilt++;
      } else if (new Set(this.starportUnitIds).has(purchase.unitIdPurchased)) {
        this.starportUnitsBeingBuilt++;
      } else {
        this.glitchersBeingBuilt++;
      }
      this.primeTheTimerForUnitPurchases(startTime, purchase.unitIdPurchased, purchase.quantityPurchased, salt, purchase);
    });
  }

  private async updateUnitResearchTimers() { 
    if (!this.unitUpgradeStats) {
      const unitUpgradeStatsRes = await this.nexusService.getUnitUpgradeStats();
      if (unitUpgradeStatsRes) {
        this.unitUpgradeStats = unitUpgradeStatsRes;
      }
    }

    this.reinitializeResearchTimers();

    if (!this.nexusUnitUpgrades || !this.nexusBase || !this.units || !this.unitUpgradeStats) return;

    const unitMap = new Map(this.units.map(unit => [unit.unitId, unit]));
    const upgradeStatsMap = new Map(this.unitUpgradeStats.map(stat => [stat.unitLevel, stat]));

    const utcNow = new Date().getTime();

    this.nexusUnitUpgrades.forEach(upgrade => {
      if (!this.nexusBase) return;
      const unit = unitMap.get(upgrade.unitIdUpgraded);
      if (!unit) return;

      const startTimeTime = new Date(upgrade.timestamp).getTime();
      const elapsedTimeInSeconds = Math.floor((utcNow - startTimeTime) / 1000);
      const unitTimeDuration = unit.duration;

      const levelKey = unit.unitType !== "siege_tank" ? `${unit.unitType}Level` : "siegeTankLevel" as keyof NexusBase;
      const foundUnitLevel = this.nexusBase[levelKey as keyof NexusBase] as number;

      const upgradeStat = upgradeStatsMap.get(foundUnitLevel);
      if (upgradeStat) {
        const remainingTimeInSeconds = (unitTimeDuration) - elapsedTimeInSeconds;
        this.isUpgradingUnits = true;
        this.startUnitResearchTimer(`${unit.unitType} level ${foundUnitLevel}`, remainingTimeInSeconds, upgrade);
      }
    });
  }


  private startUpgradeTimer(upgrade: string, time: number, isUnit: boolean, object: object) {
    if ((isUnit && this.unitTimers[upgrade]) || (!isUnit && this.buildingTimers[upgrade]) || !time || isNaN(time)) {
      return;
    }

    const endTime = Math.max(0, time) + 1;
    const timerObject = {
      key: upgrade,
      object: object,
      endTime: endTime,
      timeout: setTimeout(async () => {
        this.addNotification(`${upgrade}${isUnit ? ' ' : ' upgrade '}completed.`);

        if (isUnit) {
          if (!this.nexusUnits) {
            this.nexusUnits = {} as NexusUnits;
          }
          if (!this.nexusAvailableUnits) {
            this.nexusAvailableUnits = this.reinitializeByType("nexusAvailableUnits");
          }
          if (this.nexusAvailableUnits && this.nexusUnits) {
            const timer = this.unitTimers[upgrade];
            const obj = timer.object as NexusUnitsPurchased;
            const unitType = this.getUnitTypeFromId(obj.unitIdPurchased);
            const qtyPurchased = obj.quantityPurchased;
            delete this.unitTimers[upgrade];

            const unitMap: any = {
              marine: 'marineTotal',
              goliath: 'goliathTotal',
              siege_tank: 'siegeTankTotal',
              scout: 'scoutTotal',
              wraith: 'wraithTotal',
              battlecruiser: 'battlecruiserTotal',
              glitcher: 'glitcherTotal'
            };

            const unitProperty = unitMap[unitType] as keyof NexusUnits;
            if (unitProperty) {
              this.nexusUnits[unitProperty] += qtyPurchased;
              this.nexusAvailableUnits[unitProperty] += qtyPurchased;
            }

            if (this.allNexusUnits && this.nexusBase) {
              const affectedAllNexusUnits = this.allNexusUnits.find(x => x.coordsX == this.nexusBase?.coordsX && x.coordsY == this.nexusBase.coordsY);
              if (affectedAllNexusUnits) {
                affectedAllNexusUnits[unitProperty] = this.nexusUnits[unitProperty];
              }
            }
            this.cleanupUnits();
          }
        } else {
          delete this.buildingTimers[upgrade];
          if (this.nexusBase) {
            const buildingType = upgrade.split(' ')[2];
            const buildingMap: any = {
              command_center: () => this.nexusBase!.commandCenterLevel++,
              engineering_bay: () => this.nexusBase!.engineeringBayLevel++,
              mines: () => { 
                this.nexusBase!.minesLevel++;
                this.getMiningSpeedsAndSetMiningSpeed();
                this.startGoldIncrement();
              },
              warehouse: () => {
                this.nexusBase!.warehouseLevel++;
                this.goldCapacity = ((this.nexusBase?.warehouseLevel ?? 0) + 1) * 5000;
                this.startGoldIncrement();
              },
              supply_depot: () => {
                this.nexusBase!.supplyDepotLevel++;
                this.supplyCapacity = this.nexusBase!.supplyDepotLevel * 2500;
              },
              factory: () => this.nexusBase!.factoryLevel++,
              starport: () => this.nexusBase!.starportLevel++
            };

            const upgradeKey = `${buildingType}Upgraded` as keyof NexusBaseUpgrades;
            if (buildingMap[buildingType]) {
              buildingMap[buildingType]();
              if (this.nexusBaseUpgrades) {
                this.nexusBaseUpgrades[upgradeKey] = undefined as any;
              }
            }

            this.currentValidAvailableUpgrades = undefined;
          }
        }

        clearInterval(timerObject.interval);
      }, endTime * 1000),

      interval: setInterval(() => {
        if (isUnit && this.unitTimers[upgrade]) {
          this.unitTimers[upgrade].endTime--;
        } else if (!isUnit && this.buildingTimers[upgrade]) {
          this.buildingTimers[upgrade].endTime--;
        }
      }, 1000)
    };

    if (isUnit) {
      this.unitTimers[upgrade] = timerObject;
    } else {
      this.buildingTimers[upgrade] = timerObject;
    }
  }

  private startGenericTimer(timerMap: { [key: string]: NexusTimer }, key: string, time: number, object: object, completionMessage: string, onComplete: () => void) {
    // Return if the timer already exists or time is invalid
    if (timerMap[key] || time <= 0 || isNaN(time)) {
      return;
    } 
    const endTime = Math.max(1, Math.floor(time));

    // Define the timer object
    const timer = {
      key: key,
      object: object,
      endTime: endTime,
      timeout: setTimeout(async () => {
        this.addNotification(completionMessage);

        clearInterval(timer.interval);
        clearTimeout(timer.timeout);

        delete timerMap[key];
        onComplete();
      }, endTime * 1000),

      interval: setInterval(() => {
        if (timerMap[key]) {
          timerMap[key].endTime--;
        }
      }, 1000)
    };

    // Store the timer in the map
    timerMap[key] = timer;
  }

  private startAttackTimer(attack: string, time: number, object: object) {
    this.startGenericTimer(this.attackTimers, attack, time, object, `${attack} completed.`, async () => {
      this.debounceLoadNexusData();
    });
  }

  private startDefenceTimer(defence: string, time: number, object: object) {
    this.startGenericTimer(this.defenceTimers, defence, time, object, `${defence} completed.`, async () => {
      this.debounceLoadNexusData();
    });
  }

  private startUnitResearchTimer(research: string, time: number, object: object) {
    this.startGenericTimer(this.researchTimers, research, time, object, `${research} research completed.`, () => {
      const unitId = this.getUnitIdFromType(research);
      this.nexusUnitUpgrades = this.nexusUnitUpgrades?.filter(x => x.unitIdUpgraded == unitId);
      if (this.nexusBase) {
        this.nexusBase[`${(research == 'siege_tank' ? 'siegeTank' : research)}Level` as keyof NexusBase]++;
      }
    });
  }


  private getBuildingUpgradesInfo() {
    if (!this.parentRef || !this.parentRef.user || !this.nexusBase) return;
    this.reinitializeBuildingTimers();

    const upgradeMapping = {
      commandCenterUpgraded: "command_center",
      supplyDepotUpgraded: "supply_depot",
      factoryUpgraded: "factory",
      starportUpgraded: "starport",
      minesUpgraded: "mines",
      engineeringBayUpgraded: "engineering_bay",
      warehouseUpgraded: "warehouse"
    };

    if (this.nexusBaseUpgrades) {
      for (const [upgradeKey, timerKey] of Object.entries(upgradeMapping)) {
        const startTime = this.nexusBaseUpgrades[upgradeKey as keyof NexusBaseUpgrades];
        if (startTime && !this.buildingTimers[timerKey]) {
          this.primeTheTimerForBuildingUgrades(startTime as Date, timerKey, upgradeKey as Object);
        }
      }
    }
  }


  private primeTheTimerForBuildingUgrades(startTime: Date, type: string, object: object) {
    if (this.nexusAvailableUpgrades && this.nexusBase) {
      const startTimeTime = new Date(startTime).getTime();
      let duration = 0;
      if (type == "command_center") {
        duration = this.nexusAvailableUpgrades.find(u => this.nexusBase && u.building === type && u.nextLevel == this.nexusBase.commandCenterLevel)?.duration ?? 0;
      } else if (type == "supply_depot") {
        duration = this.nexusAvailableUpgrades.find(u => this.nexusBase && u.building === type && u.nextLevel == this.nexusBase.supplyDepotLevel)?.duration ?? 0;
      } else if (type == "factory") {
        duration = this.nexusAvailableUpgrades.find(u => this.nexusBase && u.building === type && u.nextLevel == this.nexusBase.factoryLevel)?.duration ?? 0;
      } else if (type == "starport") {
        duration = this.nexusAvailableUpgrades.find(u => this.nexusBase && u.building === type && u.nextLevel == this.nexusBase.starportLevel)?.duration ?? 0;
      } else if (type == "mines") {
        duration = this.nexusAvailableUpgrades.find(u => this.nexusBase && u.building === type && u.nextLevel == this.nexusBase.minesLevel)?.duration ?? 0;
      } else if (type == "engineering_bay") {
        duration = this.nexusAvailableUpgrades.find(u => this.nexusBase && u.building === type && u.nextLevel == this.nexusBase.engineeringBayLevel)?.duration ?? 0;
      } else if (type == "warehouse") {
        duration = this.nexusAvailableUpgrades.find(u => this.nexusBase && u.building === type && u.nextLevel == this.nexusBase.warehouseLevel)?.duration ?? 0;
      }
      const utcNow = new Date().getTime();
      const elapsedTimeInSeconds = Math.floor((utcNow - startTimeTime)) / 1000;
      const remainingTimeInSeconds = duration - elapsedTimeInSeconds;
      const salt = "{" + this.nexusBase?.coordsX + " " + this.nexusBase?.coordsY + "} ";

      if (remainingTimeInSeconds > 0) {
        this.startUpgradeTimer(salt + type, remainingTimeInSeconds, false, object);
      }
    }

  }



  private primeTheTimerForUnitPurchases(startTime: Date, id: number, quantity: number, displayFirst: string, object: object) {
    if (!this.units) return;
    const startTimeTime = new Date(startTime).getTime();
    const unit = this.units.find(u => u.unitId === id);
    const duration = unit ? unit.duration * quantity : 0;
    const type = displayFirst + (unit ? unit.unitType : "");

    const utcNow = new Date().getTime();
    const elapsedTimeInSeconds = Math.floor((utcNow - startTimeTime)) / 1000;
    const remainingTimeInSeconds = duration - elapsedTimeInSeconds;

    if (remainingTimeInSeconds > 0) {
      this.startUpgradeTimer(type, remainingTimeInSeconds + 1, true, object);
    }
  }

  private async reinitializeBuildingTimers() {
    Object.keys(this.buildingTimers).forEach(building => {
      if (this.buildingTimers[building]) {
        clearInterval(this.buildingTimers[building].interval);
        clearTimeout(this.buildingTimers[building].timeout);
        delete this.buildingTimers[building];
      }
    });
    this.buildingTimers = {};
  }
  private async reinitializeUnitTimers() {
    Object.keys(this.unitTimers).forEach(unit => {
      if (this.unitTimers[unit]) {
        clearInterval(this.unitTimers[unit].interval);
        clearTimeout(this.unitTimers[unit].timeout);
        delete this.unitTimers[unit];
      }
    });
    this.unitTimers = {};
  }

  private async reinitializeResearchTimers() {
    this.isUpgradingUnits = false;
    Object.keys(this.researchTimers).forEach(research => {
      if (this.researchTimers[research]) {
        clearInterval(this.researchTimers[research].interval);
        clearTimeout(this.researchTimers[research].timeout);
        delete this.researchTimers[research];
      }
    });
    this.researchTimers = {};
  }

  private displayBuildings(nexusBaseUpgrades?: NexusBaseUpgrades, value?: boolean) {
    if (value) {
      this.displayMines = value;
      this.displayFactory = value;
      this.displayStarport = value;
      this.displaySupplyDepot = value;
      this.displayEngineeringBay = value;
      this.displayWarehouse = value;
      this.displayCommandCenter = value;
      return;
    }

    if (!this.nexusBase || !nexusBaseUpgrades) return;
    this.displayMines = !!(nexusBaseUpgrades.minesUpgraded || this.nexusBase.minesLevel > 0);
    this.displayFactory = !!(nexusBaseUpgrades.factoryUpgraded || this.nexusBase.factoryLevel > 0);
    this.displayStarport = !!(nexusBaseUpgrades.starportUpgraded || this.nexusBase.starportLevel > 0);
    this.displaySupplyDepot = !!(nexusBaseUpgrades.supplyDepotUpgraded || this.nexusBase.supplyDepotLevel > 0);
    this.displayWarehouse = !!(nexusBaseUpgrades.warehouseUpgraded || this.nexusBase.warehouseLevel > 0);
    this.displayEngineeringBay = !!(nexusBaseUpgrades.engineeringBayUpgraded || this.nexusBase.engineeringBayLevel > 0);

    this.currentSupplyDepotSrc = this.nexusBase.supplyDepotLevel < 3 ? this.sdlvl1Src : this.nexusBase.supplyDepotLevel < 4 ? this.sdlvl2Src : this.sdlvl3Src;
    this.currentCommandCenterSrc = this.nexusBase.commandCenterLevel < 3 ? this.cclvl1Src : this.nexusBase.commandCenterLevel < 4 ? this.cclvl2Src : this.cclvl3Src;
    this.currentFactorySrc = this.nexusBase.factoryLevel < 3 ? this.flvl1Src : this.nexusBase.factoryLevel < 4 ? this.flvl2Src : this.flvl3Src;
    this.currentStarportSrc = this.nexusBase.starportLevel < 3 ? this.splvl1Src : this.nexusBase.starportLevel < 4 ? this.splvl2Src : this.splvl3Src;
    this.currentWarehouseSrc = this.nexusBase.warehouseLevel < 3 ? this.whlvl1Src : this.nexusBase.warehouseLevel < 4 ? this.whlvl2Src : this.whlvl3Src;
    this.currentEngineeringBaySrc = this.nexusBase.engineeringBayLevel < 3 ? this.eblvl1Src : this.nexusBase.engineeringBayLevel < 4 ? this.eblvl2Src : this.eblvl3Src;
    this.currentMinesSrc = this.nexusBase.minesLevel < 3 ? this.mineslvl1Src : this.nexusBase.minesLevel < 4 ? this.mineslvl2Src : this.mineslvl3Src;
  }

  async upgradeBuilding(upgrade: string) {
    if (this.parentRef?.user?.id && this.nexusBase && this.nexusAvailableUpgrades) {

      if (this.getBuildingCountersLength() >= this.nexusBase.commandCenterLevel + 1) {
        return alert("Upgrade your Command Center for more worker slots");
      } else if (this.nexusBaseUpgrades && this.nexusBaseUpgrades[(upgrade + 'Upgraded') as keyof NexusBaseUpgrades]) {
        return alert("You must wait until the upgrade finishes");
      }
      let upgradeCost = 0;
      upgradeCost = this.nexusAvailableUpgrades.find(x => this.nexusBase && x.building == upgrade && x.nextLevel == this.nexusBase[((upgrade == "command_center" ? "commandCenter" : upgrade == "supply_depot" ? "supplyDepot" : upgrade == "engineering_bay" ? "engineeringBay" : upgrade) + 'Level') as keyof NexusBase])?.cost ?? 0
      if (!this.isUpgradeAffordable(upgradeCost, upgrade)) {
        return alert("Not enough gold!");
      }

      this.startLoading();
      this.reinitializeByType("nexusBaseUpgrades");
      console.log("upgrading " + upgrade);
      switch (upgrade) {
        case 'mines':
          this.nexusBaseUpgrades!.minesUpgraded = new Date();
          this.nexusService.upgradeMines(this.parentRef.user.id, this.nexusBase).then(res => this.handleUpgradeResponse(res));
          break;
        case 'starport':
          this.nexusBaseUpgrades!.starportUpgraded = new Date();
          this.nexusService.upgradeStarport(this.parentRef.user.id, this.nexusBase).then(res => this.handleUpgradeResponse(res));
          break;
        case 'factory':
          this.nexusBaseUpgrades!.factoryUpgraded = new Date();
          this.nexusService.upgradeFactory(this.parentRef.user.id, this.nexusBase).then(res => this.handleUpgradeResponse(res));
          break;
        case 'engineering_bay':
          this.nexusBaseUpgrades!.engineeringBayUpgraded = new Date();
          this.nexusService.upgradeEngineeringBay(this.parentRef.user.id, this.nexusBase).then(res => this.handleUpgradeResponse(res));
          break;
        case 'warehouse':
          this.nexusBaseUpgrades!.warehouseUpgraded = new Date();
          this.nexusService.upgradeWarehouse(this.parentRef.user.id, this.nexusBase).then(res => this.handleUpgradeResponse(res));
          break;
        case 'supply_depot':
          this.nexusBaseUpgrades!.supplyDepotUpgraded = new Date();
          this.nexusService.upgradeSupplyDepot(this.parentRef.user.id, this.nexusBase).then(res => this.handleUpgradeResponse(res));
          break;
        case 'command_center':
          this.nexusBaseUpgrades!.commandCenterUpgraded = new Date();
          this.nexusService.upgradeCommandCenter(this.parentRef.user.id, this.nexusBase).then(res => this.handleUpgradeResponse(res));
          break;
        default:
          alert("Unknown building type");
          return;
      }

      this.displayBuildings(this.nexusBaseUpgrades);
      this.updateCurrentBasesGold(upgradeCost);
      this.getBuildingUpgradesInfo();
      this.startGoldIncrement();
      this.stopLoading();
    }
  }

  private handleUpgradeResponse(res: any): void {
    this.addNotification(res);
    if (res.toLowerCase().includes("not enough gold")) {
      this.loadNexusData();
    }
  }

  private updateCurrentBasesGold(upgradeCost: number) {
    if (this.currentPersonalBases && this.nexusBase) {
      this.nexusBase.gold -= upgradeCost;
      this.currentPersonalBases.find(x => x.coordsX == this.nexusBase!.coordsX && x.coordsY == this.nexusBase!.coordsY)!.gold = this.nexusBase.gold;
    }
  }

  private isUpgradeAffordable(upgradeCost: number, upgrade: string): boolean { 
    if (this.nexusBase && (this.nexusBase.gold - upgradeCost) > 0) { 
      return true;
    } else { 
      this.addNotification(`{${this.nexusBase?.coordsX},${this.nexusBase?.coordsY}} Not enough gold to upgrade ${upgrade}`);
      return false;
    }
  }

  async purchaseUnit(unitId: number) {
    if (!this.units) return;
    const tmpUnit = this.units.find(x => x.unitId == unitId);
    if (!this.parentRef || !this.parentRef.user || !tmpUnit || !this.nexusBase || !tmpUnit.purchasedValue) return;

    if ((this.factoryUnitIds.includes(unitId)) && this.factoryUnitsBeingBuilt >= this.nexusBase.factoryLevel) {
      return alert("Upgrade the Factory to train more units simultaneously.");
    } else if ((this.starportUnitIds.includes(unitId)) && this.starportUnitsBeingBuilt >= this.nexusBase.starportLevel) {
      return alert("Upgrade the Starport to train more units simultaneously.");
    }
    this.startLoading();


    const totalCost = tmpUnit.purchasedValue * tmpUnit.cost;
    const totalSupplyCost = tmpUnit.purchasedValue * tmpUnit.supply;
    if ((this.nexusBase.gold - totalCost) < 0) {
      this.addNotification(`Not enough gold to buy ${tmpUnit.purchasedValue} ${tmpUnit.unitType}.`);
    }
    else if (tmpUnit.unitType == "glitcher" && (this.nexusUnits && this.nexusUnits.glitcherTotal > 0)) {
      this.addNotification(`You cannot have more then one glitcher per base.`);
    }
    else {
      this.updateCurrentBasesGold(totalCost);
      this.nexusBase.supply += totalSupplyCost;
      const purchasedUnit = {
        coordsX: this.nexusBase.coordsX,
        coordsY: this.nexusBase.coordsY,
        unitIdPurchased: unitId,
        quantityPurchased: tmpUnit.purchasedValue,
        timestamp: new Date(),

      } as NexusUnitsPurchased;
      if (!this.nexusUnitsPurchaseList) { this.nexusUnitsPurchaseList = []; }
      this.nexusUnitsPurchaseList.push(purchasedUnit);

      this.getUnitTimers();
      this.nexusService.purchaseUnit(this.nexusBase.user?.id ?? 0, this.nexusBase, tmpUnit.unitId, tmpUnit.purchasedValue ?? 0).then(res => this.handleUpgradeResponse(res));
    }


    if (this.units) {
      this.units.forEach(x => {
        x.purchasedValue = undefined;
      });
    }
    this.stopLoading();
  }

  startGoldIncrement() {
    if (this.goldIncrementInterval) {
      clearInterval(this.goldIncrementInterval);
    }

    this.goldIncrementInterval = setInterval(() => {
      if (this.miningSpeed && this.nexusBase && this.nexusBase.gold < this.goldCapacity && this.nexusBase.minesLevel > 0) {
        const goldToAdd = 1 / this.miningSpeed; // Calculate the fraction of gold to add
        this.nexusBase.gold += goldToAdd;

        // Ensure gold does not exceed the capacity
        if (this.nexusBase.gold > this.goldCapacity) {
          this.nexusBase.gold = this.goldCapacity;
        }

        // Stop incrementing when gold reaches the capacity
        if (this.nexusBase.gold >= this.goldCapacity) {
          this.stopGoldIncrement();
        }
      }
    }, 1000); // Run the interval every second
  }
  calculateTimeUntilMaxCapacity(): number {
    if (!this.nexusBase || !this.miningSpeed) {
      return 0;
    }

    const remainingGold = this.goldCapacity - this.nexusBase.gold;
    const timeInSeconds = remainingGold * this.miningSpeed;

    return Math.max(timeInSeconds, 0);
  }
  calculateCurrentSupply() {
    if (!this.nexusBase) return 0;
    return (this.nexusBase.supplyDepotLevel * 2500) - this.nexusBase.supply;
  }

  stopGoldIncrement() {
    if (this.goldIncrementInterval) {
      clearInterval(this.goldIncrementInterval);
    }
  }
  copyLink() {
    const link = `https://bughosted.com/War`;
    try {
      navigator.clipboard.writeText(link);
      this.addNotification("Link copied to clipboard!");
    } catch {
      this.addNotification("Error: Unable to share link!");
    }
  }

  formatTimer(allSeconds?: number): string {
    return this.nexusService.formatTimer(allSeconds);
  }

  activeBuildingTimers(): { building: string; endTime: number }[] {
    const activeTimers: { building: string; endTime: number }[] = [];
    this.buildingTimers = Object.fromEntries(Object.entries(this.buildingTimers).sort(([, a], [, b]) => a.endTime - b.endTime));

    for (const building in this.buildingTimers) {
      const timer = this.buildingTimers[building];
      if (timer.endTime) {
        activeTimers.push({ building: building, endTime: timer.endTime });
      }
    }

    return activeTimers;
  }
  activeUnitTimers(): { unit: string; endTime: number; object: object }[] {
    const activeTimers: { unit: string; endTime: number; object: object }[] = [];
    this.unitTimers = Object.fromEntries(Object.entries(this.unitTimers).sort(([, a], [, b]) => a.endTime - b.endTime));

    for (const unit in this.unitTimers) {
      const timer = this.unitTimers[unit];
      if (timer.endTime) {
        activeTimers.push({ unit: unit, endTime: timer.endTime, object: timer.object });
      }
    }

    return activeTimers;
  }


  activeResearchTimers(): { unit: string; endTime: number }[] {
    const activeTimers: { unit: string; endTime: number }[] = [];
    this.researchTimers = Object.fromEntries(Object.entries(this.researchTimers).sort(([, a], [, b]) => a.endTime - b.endTime));

    for (const unit in this.researchTimers) {
      const timer = this.researchTimers[unit];
      if (timer.endTime) {
        activeTimers.push({ unit: unit, endTime: timer.endTime });
      }
    }

    return activeTimers;
  }

  activeAttackTimers(): { unit: string; endTime: number; object: object }[] {
    const activeTimers: { unit: string; endTime: number; object: object }[] = [];
     
    const at = Object.entries(this.attackTimers).filter(([key, value]) => {
      const attack = value.object as NexusAttackSent; 
      return attack.originCoordsX === this.nexusBase?.coordsX && attack.originCoordsY === this.nexusBase?.coordsY;
    });

    for (const [unit, timer] of at) {
      if (timer.endTime) {
        activeTimers.push({ unit, endTime: timer.endTime, object: timer.object });
      }
    }

    return activeTimers;
  }
  activeDefenceTimers(): { unit: string; endTime: number; object: object }[] {
    const activeTimers: { unit: string; endTime: number; object: object }[] = [];
    this.defenceTimers = Object.fromEntries(Object.entries(this.defenceTimers).sort(([, a], [, b]) => a.endTime - b.endTime));
     
    const at = Object.entries(this.defenceTimers).filter(([key, value]) => {
      const attack = value.object as NexusAttackSent; 
      return (attack.originCoordsX == this.nexusBase?.coordsX && attack.originCoordsY === this.nexusBase?.coordsY) || (attack.destinationCoordsX === this.nexusBase?.coordsX && attack.destinationCoordsY === this.nexusBase?.coordsY);
    });

    for (const [unit, timer] of at) {
      if (timer.endTime) {
        activeTimers.push({ unit, endTime: timer.endTime, object: timer.object });
      }
    }

    return activeTimers;
  }

  async closeUserComponent(user: User) {
    if (!this.parentRef) return;

    this.parentRef.user = user;
    this.isUserComponentOpen = false;
    this.loadNexusData().then(() => {
      if (this.numberOfPersonalBases == 0) {
        this.isUserNew = true;
      } else {
        this.isUserNew = false
      }
    }); 
  }
  openCommandCenter() {
    this.toggleScreen('', false);
    this.isCommandCenterOpen = true;
  }
  closeCommandCenter() {
    this.isCommandCenterOpen = false;
  }
  openMines() {
    this.toggleScreen('', false);
    this.isMinesOpen = true;
  }
  closeMines() {
    this.isMinesOpen = false;
  }

  openFactory() {
    this.toggleScreen('', false);
    this.isFactoryOpen = true;
  }
  closeFactory() {
    this.isFactoryOpen = false;
    if (!this.units) return;
    this.units.forEach(x => {
      x.purchasedValue = undefined;
    });
  }

  openStarport() {
    this.toggleScreen('', false);
    this.isStarportOpen = true;
  }
  closeStarport() {
    this.isStarportOpen = false;
    if (!this.units) return;
    this.units.forEach(x => {
      x.purchasedValue = undefined;
    });
  }
  openSupplyDepot() {
    this.toggleScreen('', false);
    this.isSupplyDepotOpen = true;
  }
  closeSupplyDepot() {
    this.isSupplyDepotOpen = false;
  }
  openEngineeringBay() {
    this.toggleScreen('', false);
    this.isEngineeringBayOpen = true;
  }
  closeEngineeringBay() {
    this.isEngineeringBayOpen = false;
  }
  openWarehouse() {
    this.toggleScreen('', false);
    this.isWarehouseOpen = true;
  }
  closeWarehouse() {
    this.isWarehouseOpen = false;
  }
  getBuildingCountersLength() {
    return Object.keys(this.buildingTimers).length;
  }
  getValidBuildingUpgrades() {
    if (!this.nexusAvailableUpgrades || !this.nexusBase) {
      return [];
    }
    if (this.currentValidAvailableUpgrades) return [];

    if (!this.currentValidAvailableUpgrades) {
      this.currentValidAvailableUpgrades = [] as UpgradeDetail[];
    }


    if (this.nexusAvailableUpgrades) {
      if (!this.nexusBase || !this.nexusBase.minesLevel) {
        this.currentValidAvailableUpgrades = this.nexusAvailableUpgrades.filter(x =>
          x.building == "mines" && x.nextLevel == 0
        );
      } else {
        this.currentValidAvailableUpgrades = this.nexusAvailableUpgrades.filter(x =>
          x.building == "mines" && x.nextLevel == this.nexusBase?.minesLevel
          || x.building == "command_center" && x.nextLevel == this.nexusBase?.commandCenterLevel
          || x.building == "supply_depot" && x.nextLevel == this.nexusBase?.supplyDepotLevel
          || x.building == "engineering_bay" && x.nextLevel == this.nexusBase?.engineeringBayLevel
          || x.building == "warehouse" && x.nextLevel == this.nexusBase?.warehouseLevel
          || x.building == "starport" && x.nextLevel == this.nexusBase?.starportLevel
          || x.building == "factory" && x.nextLevel == this.nexusBase?.factoryLevel
        );
      }
      return this.currentValidAvailableUpgrades;
    } else {
      return this.currentValidAvailableUpgrades;
    }

  }
  maxSliderValue(unit?: UnitStats): number {
    if (!this.nexusBase || !unit) return 0;
    const goldTimesUnitGoldMaxCost = Math.floor(this.nexusBase.gold / unit.cost);
    const supplyTimesUnitGoldMaxCost = Math.floor(this.calculateCurrentSupply() / unit.supply);

    const maxGoldValue = Math.min(goldTimesUnitGoldMaxCost, supplyTimesUnitGoldMaxCost);

    return maxGoldValue;
  }
  onSliderChange(event: any, unit: UnitStats): void {
    const value = Math.min(this.maxSliderValue(unit), event.target.value);
    unit.purchasedValue = value;
    event.target.value = value;
  }
  getFactoryUnits() {
    if (!this.units) return;

    return this.units.filter(x =>
      this.factoryUnitIds.includes(x.unitId)
      && x.engineeringBayLevel <= this.nexusBase!.engineeringBayLevel
      && x.factoryLevel <= this.nexusBase!.factoryLevel
      && x.starportLevel <= this.nexusBase!.starportLevel
    ).sort((a, b) => a.cost - b.cost);
  }
  getStarportUnits() {
    if (!this.units) return;

    return this.units.filter(x =>
      this.starportUnitIds.includes(x.unitId)
      && x.engineeringBayLevel <= this.nexusBase!.engineeringBayLevel
      && x.factoryLevel <= this.nexusBase!.factoryLevel
      && x.starportLevel <= this.nexusBase!.starportLevel
    ).sort((a, b) => a.cost - b.cost);
  }

  getSupplyUsedForUnit(unitId: number) {
    const unit = this.units?.find(x => x.unitId === unitId);
    if (!unit) {
      return 0;
    }

    const unitSupplyMap: { [key: string]: number | undefined } = {
      "marine": this.nexusUnits?.marineTotal,
      "goliath": this.nexusUnits?.goliathTotal,
      "siege_tank": this.nexusUnits?.siegeTankTotal,
      "scout": this.nexusUnits?.scoutTotal,
      "wraith": this.nexusUnits?.wraithTotal,
      "battlecruiser": this.nexusUnits?.battlecruiserTotal,
      "glitcher": this.nexusUnits?.glitcherTotal
    };

    let totalSupplyUsed = unit.supply * (unitSupplyMap[unit.unitType] ?? 0);


    if (this.nexusUnitsPurchaseList) {
      this.nexusUnitsPurchaseList.forEach(purchase => {
        if (purchase.unitIdPurchased === unitId) {
          totalSupplyUsed += unit.supply * purchase.quantityPurchased;
        }
      });
    }

    return totalSupplyUsed;
  }


  formatBuildingTimer(s: string) {
    const endIndex = s.indexOf('}');
    const dotIndex = s.indexOf('.', endIndex + 1);
    return s.substring(dotIndex + 1).replace('_', ' ');
  }
  getXCoordsFromTimer(s: string): number {
    const start = s.indexOf('{') + 1;
    const end = s.indexOf(',');
    return parseInt(s.slice(start, end));
  }

  getYCoordsFromTimer(s: string): number {
    const start = s.indexOf(',') + 1;
    const end = s.indexOf('}');
    return parseInt(s.slice(start, end));
  }
  getFormattedBuildingTimer(building: string) {
    const timer = this.getBuildingTimerForBuilding(building);
    return timer ? this.nexusService.formatTimer(timer.endTime) : '';
  }
  getBuildingTimerForBuilding(building: string) {
    return this.buildingTimers[
      `{${this.nexusBase?.coordsX} ${this.nexusBase?.coordsY}} ${this.formatBuildingTimer(building).toLowerCase().replace(' ', '_')}`
    ];
  }

  private loadPictureSrcs(sessionToken: string) {
    const pictureSrcMap: { key: string; id: number }[] = [
      { key: 'cclvl1Src', id: 6546 },
      { key: 'cclvl2Src', id: 6547 },
      { key: 'cclvl3Src', id: 6544 },
      { key: 'splvl1Src', id: 6567 },
      { key: 'splvl2Src', id: 6565 },
      { key: 'splvl3Src', id: 6566 },
      { key: 'mineslvl1Src', id: 6551 },
      { key: 'mineslvl2Src', id: 6549 },
      { key: 'mineslvl3Src', id: 6553 },
      { key: 'flvl1Src', id: 6550 },
      { key: 'flvl2Src', id: 6554 },
      { key: 'flvl3Src', id: 6552 },
      { key: 'sdlvl1Src', id: 6555 },
      { key: 'sdlvl2Src', id: 6557 },
      { key: 'sdlvl3Src', id: 6559 },
      { key: 'whlvl1Src', id: 6562 },
      { key: 'whlvl2Src', id: 6563 },
      { key: 'whlvl3Src', id: 6564 },
      { key: 'eblvl1Src', id: 6545 },
      { key: 'eblvl2Src', id: 6548 },
      { key: 'eblvl3Src', id: 6543 },
      { key: 'nexusBackgroundPictureSrc', id: 6556 },
      { key: 'nexusLevel1Src', id: 6631 },
      { key: 'nexusLevel2Src', id: 6632 },
      { key: 'nexusLevel3Src', id: 6630 },
      { key: 'mapTileSrc', id: 6293 },
      { key: 'mapTileSrc2', id: 6292 },
      { key: 'mapTileSrc3', id: 6293 },
      { key: 'marinePictureSrc', id: 6240 },
      { key: 'goliathPictureSrc', id: 6237 },
      { key: 'siegeTankPictureSrc', id: 6246 },
      { key: 'scoutPictureSrc', id: 6244 },
      { key: 'wraithPictureSrc', id: 6245 },
      { key: 'battlecruiserPictureSrc', id: 6243 },
      { key: 'glitcherPictureSrc', id: 6261 },
    ];
    const loadPromises = pictureSrcMap.map(({ key, id }) => {
      if (key) {
        return this.fileService.getFileSrcByFileId(id, sessionToken)
          .then(src => {
            (this[key as keyof this] as string) = src;
          })
          .catch(error => {
            console.error(`Error loading source for key ${key}:`, error);
          });
      }
      return Promise.resolve();
    });

    Promise.all(loadPromises);
  }

  toggleScreen(screen: string, isOpen?: boolean) {
    this.startLoading();
    try {
      if (this.isMapOpen && !isOpen) {
        this.loadNexusData(); 
      }
      this.isMinesOpen = false;
      this.isCommandCenterOpen = false;
      this.isStarportOpen = false;
      this.isFactoryOpen = false;
      this.isMinesOpen = false;
      this.isWarehouseOpen = false;
      this.isEngineeringBayOpen = false
      this.isSupplyDepotOpen = false;
      this.isReportsOpen = false;
      this.isMapOpen = false;
      this.isBasesOpen = false;
      this.isSupportOpen = false;
      this.toggledUnitStat = undefined;
      this.toggleUnitScreen();

      if (screen == "reports") {
        setTimeout(() => {
          this.isReportsOpen = isOpen != undefined ? isOpen : !this.isReportsOpen;
        }, 50);
      }
      else if (screen == "map") { 
        this.hideBaseNavForMap = false;
        this.mapComponent?.resetComponentMainWidth();
        setTimeout(() => {
          this.isMapOpen = isOpen != undefined ? isOpen : !this.isMapOpen;
          setTimeout(() => {
            if (!this.mapData) {
              this.fetchMapData().then(() => {
                setTimeout(() => {
                  if (this.mapData && isOpen && !this.mapComponent.isMapRendered) {
                    this.mapComponent.setMapData();
                    setTimeout(() => {
                      if (this.nexusBase && !this.preventMapScrolling && this.mapComponent) {
                        this.mapComponent.scrollToCoordinates(this.nexusBase.coordsX, this.nexusBase.coordsY);
                      }
                    }, 10)
                  }
                }, 50); 
              })
            }
            else if (this.mapData && isOpen && !this.mapComponent.isMapRendered) {
              this.mapComponent.setMapData();
              setTimeout(() => {
                if (this.nexusBase && !this.preventMapScrolling && this.mapComponent) {
                  this.mapComponent.scrollToCoordinates(this.nexusBase.coordsX, this.nexusBase.coordsY); 
                }
              }, 10);
            }
          }, 50);
        }, 50);
      }
      else if (screen == "bases") {
        if (!isOpen) {
          this.loadNexusData();
        } else {
          this.fetchMapData();
        }
        setTimeout(() => {
          this.isBasesOpen = isOpen != undefined ? isOpen : !this.isBasesOpen; 
        }, 50);
      }
      else if (screen == "support") {
        setTimeout(() => {
          this.isSupportOpen = isOpen != undefined ? isOpen : !this.isSupportOpen;
          if (!this.isSupportOpen) {
            this.isBasesOpen = true;
          } 
        });
      } 
    } catch (ex) {
      this.addNotification((ex as Error).message); 
    }

    this.stopLoading();
  }
  toggleUnitScreen(unit?: UnitStats, type?: string, isOpen?: boolean) {
    if (isOpen == false || (isOpen && this.toggledUnitStat)) {
      this.toggledUnitStat = undefined;
    } else {
      if (unit) {
        this.toggledUnitStat = unit;
      } else if (type && this.units) {
        this.toggledUnitStat = this.units.find(x => x.unitType == type);
      }
    }
  }
  getGlitcherStats() {
    if (this.units)
      return this.units.find(x => x.unitType == "glitcher");
    else return undefined;
  }
  addNotification(notif?: string) { 
    if (notif) {
      this.parentRef?.showNotification(notif); 
    }
  }
  toggleUnitScreenFromBaseUnits(unit: string) {
    if (!this.units) return;
    const unitStat = this.units.find(x => x.unitType == unit);
    this.toggleUnitScreen(unitStat);
  }
  getResearchCostPerUnit(unit: UnitStats) {
    return unit.cost * 10 * ((unit.unitLevel ? unit.unitLevel : 0) + 1);
  }
  getResearchDisplay(unit: UnitStats) {
    const unitKey = `${unit.unitType} level ${unit.unitLevel}`;
    const researchTimer = this.researchTimers[unitKey];

    if (researchTimer) {
      return this.getActiveResearchTimerFormatted(unit);
    }

    const isCostMoreThanCurrentGold = this.unitCostsMoreThanCurrentGold(unit);
    const engineerBayUpgradeLimitReached = this.getEngineerBayUpgradeLimit() <= (this.nexusUnitUpgrades?.length ?? 0);

    if (isCostMoreThanCurrentGold || engineerBayUpgradeLimitReached) {
      return '⛔';
    }
    return '🔧';
  }
  getActiveResearchTimerFormatted(unit: UnitStats) {
    return this.formatTimer(this.researchTimers[unit.unitType + " level " + unit.unitLevel].endTime);
  }
  unitCostsMoreThanCurrentGold(unit: UnitStats) {
    return this.nexusBase && (unit.cost * 10 * ((unit.unitLevel ? unit.unitLevel : 0) + 1)) > this.nexusBase.gold;
  }
  trackByUnit(index: number, unit: UnitStats): any {
    return unit.unitId; // or a unique identifier for the unit
  }
  shouldShowIncomingAttacks(): boolean {
    return (this.attacksIncomingCount > 0 && !this.isReportsOpen && !this.isSupportOpen && !this.isBasesOpen && !this.isMapOpen && this.nexusBase) ? true : false;
  }
  shouldShowIncomingDefences(): boolean {
    return (this.defencesIncomingCount > 0 && !this.isReportsOpen && !this.isSupportOpen && !this.isBasesOpen && !this.isMapOpen && this.nexusBase) ? true : false;
  }
  shouldShowBaseNav(): boolean {
    return this.hideBaseNavForMap ? false : (this.numberOfPersonalBases > 1
      && !this.isReportsOpen
      && !this.isSupportOpen
      && !this.isBasesOpen
      && !this.showMoreEngineeringBayInfo
      && !this.isMinesOpen
      && !this.isCommandCenterOpen
      && !this.isStarportOpen
      && !this.isFactoryOpen
      && !this.isMinesOpen
      && !this.isWarehouseOpen
      && !this.isEngineeringBayOpen
      && !this.isSupplyDepotOpen
      && this.nexusBase) ? true : false;
  }
  shouldShowResources(): boolean {
    return (!this.isReportsOpen && !this.isMapOpen && !this.isBasesOpen 
      && !this.isSupportOpen && !this.showMoreWarehouseInfo && !this.showMoreFactoryInfo
       && !this.showMoreStarportInfo && !this.showMoreEngineeringBayInfo && !this.isUserNew && this.nexusBase) ? true : false;
  }
  getUnitsWithoutGlitcher() {
    if (!this.units || !this.nexusBase) return undefined;
    if (this.unitsWithoutGlitcher) return;

    const unitLevelMapping: { [key: string]: keyof NexusBase } = {
      marine: 'marineLevel',
      goliath: 'goliathLevel',
      siege_tank: 'siegeTankLevel',
      scout: 'scoutLevel',
      wraith: 'wraithLevel',
      battlecruiser: 'battlecruiserLevel',
      glitcher: 'glitcherLevel'
    };

    this.unitsWithoutGlitcher = this.units.filter(x => x.unitType !== 'glitcher' && x.factoryLevel <= (this.nexusBase?.factoryLevel ?? 0)
      && x.starportLevel <= (this.nexusBase?.starportLevel ?? 0) && x.engineeringBayLevel <= (this.nexusBase?.engineeringBayLevel ?? 0));

    let updatedUnits = this.unitsWithoutGlitcher.map(unit => {
      const unitLevelKey = unitLevelMapping[unit.unitType];
      return {
        ...unit,
        unitLevel: this.nexusBase ? this.nexusBase[unitLevelKey] : 0
      };
    }) as UnitStats[];

    return updatedUnits;
  }

  async research(unit: UnitStats) {
    if (!this.nexusUnitUpgrades || this.getEngineerBayUpgradeLimit() <= this.nexusUnitUpgrades.length) {
      return alert("Upgrade the Engineering Bay for more research upgrades.");
    }
    if (this.nexusUnitUpgrades.find(x => x.unitIdUpgraded == unit.unitId)) {
      return alert("You must wait until the current upgrade finishes.");
    }

    if (this.parentRef?.user?.id && this.nexusBase) {
      this.nexusService.research(this.nexusBase, unit).then(res => {
        this.addNotification(res)
        if (!res.toLowerCase().includes("not enough gold") && this.nexusBase) {
          const cost = this.getResearchCostPerUnit(unit);
          this.updateCurrentBasesGold(cost);
          if (!this.nexusUnitUpgrades) {
            this.nexusUnitUpgrades = [];
          }
          this.nexusUnitUpgrades.push({
            coordsX: this.nexusBase.coordsX,
            coordsY: this.nexusBase.coordsY,
            unitIdUpgraded: unit.unitId,
            timestamp: new Date(),
          } as NexusUnitUpgrades);
          this.updateUnitResearchTimers();
        }

      });
    }
  }

  getEngineerBayUpgradeLimit() {
    const { nexusBase } = this;
    return nexusBase ? Math.round(nexusBase.engineeringBayLevel / 2) : 0;
  }
  getUnitIdFromType(type: string): number {
    return this.unitTypeMap.get(type) ?? 0;
  }
  getUnitTypeFromId(id: number): string {
    return this.units?.find(x => x.unitId == id)?.unitType ?? "";
  }
  openMapAndScrollTo(timer: any, isAttack: boolean) {
    if (!('object' in timer)) {
      return
    }
    const timerObject = (timer.object as NexusAttackSent);
    const x = isAttack ? timerObject.destinationCoordsX : timerObject.originCoordsX;
    const y = isAttack ? timerObject.destinationCoordsY : timerObject.originCoordsY;
    this.preventMapScrolling = true;
    this.toggleScreen("map", true);

    setTimeout(() => {
      this.mapComponent?.scrollToCoordinates(x, y);
      this.preventMapScrolling = false;
    }, 200);
  }
  emittedOpenMapAndScrollTo(coords: string) {
    const x = parseInt(coords.split(',')[0]);
    const y = parseInt(coords.split(',')[1]);
    this.preventMapScrolling = true;
    this.toggleScreen("map", true);
    setTimeout(() => {
      this.mapComponent?.scrollToCoordinates(x, y);
      this.mapComponent?.selectCoordinates(x, y);
    }, 200);
  }
  async emittedGoToBaseEvent(nexusBase?: NexusBase) {
    this.nexusBase = nexusBase;
    this.loadNexusData();
    this.toggleScreen("map", false);
  }
  emittedReloadEvent(reason: string) {
    this.loadNexusData();
  }
  emittedNotifications(message: string) {
    if (!message || message.trim() == "") return;
    this.addNotification(message);
  }
  async emittedBaseChange(changedBase: NexusBase) {
    if (this.nexusBase && (changedBase.coordsX != this.nexusBase.coordsX || changedBase.coordsY != this.nexusBase.coordsY)) {
      this.nexusBase = changedBase;
      this.loadNexusData();
    }
    this.isBasesOpen = false;
  }
  async emittedAttackEvent(attackPayload: AttackEventPayload) {
    if (!attackPayload) {
      console.warn("Attack payload is missing");
      return;
    }

    try {
      if (attackPayload.switchBase && this.numberOfPersonalBases > 1 && this.nexusAvailableUnits) {
        this.adjustUnitsFromAttackSent(attackPayload.attack); 
        await this.nextBaseWithUnits();
      } else {
        await this.loadNexusData();
      }
    } catch (error) {
      console.error("An error occurred while processing the attack event:", error);
    }
  }

  private adjustUnitsFromAttackSent(attack: NexusAttackSent) {
    if (this.nexusAvailableUnits && attack) {
      this.adjustUnitTotals(this.nexusAvailableUnits, attack);
    }

    const currentBaseUnits = this.allNexusUnits?.find(x => x.coordsX === this.nexusBase?.coordsX &&
      x.coordsY === this.nexusBase?.coordsY
    );

    if (currentBaseUnits && attack) {
      this.adjustUnitTotals(currentBaseUnits, attack);
    }
  }

  async emittedDefenceReturned(def: NexusAttackSent) {
    this.debounceLoadNexusData();
  }
  async emittedUpgrade(res: [upgrades: NexusBase[], upgrade: string]) {
    if (this.mapData && res[0]) {
      this.mapData = this.mapData.map(base => {
        const upgradedBase = res[0].find(upgrade =>
          upgrade.coordsX === base.coordsX && upgrade.coordsY === base.coordsY
        ); 
        return upgradedBase ? upgradedBase : base;
      });
      this.currentPersonalBases = this.mapData.filter(x => x.user?.id === this.parentRef?.user?.id);
    }
    this.nexusBasesComponent.getCurrentBases(); 
    this.addNotification(`${res[1]} in ${res[0].length} bases!`);
  }
  async emittedSendBackAttackEvent(attack: object) {
    this.startLoading();
    await this.sendBack(attack, false);
    this.stopLoading();
  }
  async emittedSendBackDefenceEvent(attack: object) {
    this.startLoading();
    await this.sendBack(attack, true);
    this.stopLoading();
  }
  goToBuilding(building: string) {
    this.isCommandCenterOpen = false;
    if (building == "command_center") {
      this.isCommandCenterOpen = true;
    } else if (building == "supply_depot") {
      this.isSupplyDepotOpen = true;
    } else if (building == "warehouse") {
      this.isWarehouseOpen = true;
    } else if (building == "engineering_bay") {
      this.isEngineeringBayOpen = true;
    } else if (building == "factory") {
      this.isFactoryOpen = true;
    } else if (building == "starport") {
      this.isStarportOpen = true;
    } else if (building == "mines") {
      this.isMinesOpen = true;
    }
  }

  async findAttackId(attack: NexusAttackSent, isDefence: boolean): Promise<number | undefined> {
    let attackId: number | undefined = attack.id;

    if (!attackId) {
      // If the attack ID is undefined, wait for Nexus data to reload
      await this.loadNexusData();

      if (isDefence) {
        attackId = this.nexusDefencesSent?.reverse().find(a =>
          a.originCoordsX === attack.originCoordsX &&
          a.originCoordsY === attack.originCoordsY &&
          a.destinationCoordsX === attack.destinationCoordsX &&
          a.destinationCoordsY === attack.destinationCoordsY &&
          a.marineTotal === attack.marineTotal &&
          a.goliathTotal === attack.goliathTotal &&
          a.siegeTankTotal === attack.siegeTankTotal &&
          a.scoutTotal === attack.scoutTotal &&
          a.wraithTotal === attack.wraithTotal &&
          a.battlecruiserTotal === attack.battlecruiserTotal &&
          a.glitcherTotal === attack.glitcherTotal
        )?.id;
      }
      else {
        attackId = this.nexusAttacksSent?.reverse().find(a =>
          a.originCoordsX === attack.originCoordsX &&
          a.originCoordsY === attack.originCoordsY &&
          a.destinationCoordsX === attack.destinationCoordsX &&
          a.destinationCoordsY === attack.destinationCoordsY &&
          a.marineTotal === attack.marineTotal &&
          a.goliathTotal === attack.goliathTotal &&
          a.siegeTankTotal === attack.siegeTankTotal &&
          a.scoutTotal === attack.scoutTotal &&
          a.wraithTotal === attack.wraithTotal &&
          a.battlecruiserTotal === attack.battlecruiserTotal &&
          a.glitcherTotal === attack.glitcherTotal
        )?.id;
      }
    }

    return attackId;
  }

  async sendBack(attackSent: object, isDefence: boolean) {
    this.startLoading();
    if (!(this.parentRef?.user)) {
      return;
    }
    const attack = attackSent as NexusAttackSent;
    const attackId = await this.findAttackId(attack, isDefence);

    if (!attackId) {
      alert("Attack ID could not be found. Please try again.");
      return;
    }

    if (isDefence) {
      await this.nexusService.returnDefence(attackId).then(res => this.addNotification(res));
    } else {
      await this.nexusService.returnAttack(attackId).then(res => this.addNotification(res));
    }
    this.loadNexusData();
    this.stopLoading();
  }
  async sendBackAttack(attackSent: object) {
    await this.sendBack(attackSent, false);
  }
  async sendBackDefence(attackSent: object) {
    await this.sendBack(attackSent, true);
  }
  getQuantityPurchasedFromTimer(attack: object) {
    return (attack as NexusUnitsPurchased).quantityPurchased;
  }
  canSendUnitsBack(attack: object) {
    const na = attack as NexusAttackSent;
    return (na.originCoordsX != na.destinationCoordsX || na.originCoordsY != na.destinationCoordsY) && na.originUser?.id == this.parentRef?.user?.id && (new Date(na.timestamp) > new Date(Date.now() - 5 * 60000));
  }
  async setBaseName() {
    const baseName = this.baseNameInput.nativeElement.value.trim();
    if (this.parentRef?.user && this.nexusBase && baseName) {
      this.nexusService.setBaseName(this.nexusBase, baseName).then(res => this.addNotification(res));
      if (this.currentPersonalBases) {
        const currentBaseAffected = this.currentPersonalBases.find(x => x.coordsX == this.nexusBase?.coordsX && x.coordsY == this.nexusBase.coordsY);
        if (currentBaseAffected) {
          currentBaseAffected.baseName = baseName;
        }
        this.nexusBase.baseName = baseName;
      }
    }
  }
  async setPlayerColor() {
    let playerColor = this.playerColorInput.nativeElement.value;
    if (playerColor) {
      playerColor = playerColor.trim().replace("#", "");
      if (this.parentRef?.user?.id) {
        this.nexusService.updatePlayerColor(this.parentRef.user.id, playerColor).then(res => {
          this.parentRef?.showNotification(res);
        });
      }
      this.playerColor = playerColor;
      this.playerColors[this.parentRef?.user?.id ?? 0] = this.playerColor;
    } 
  }
  async fetchMapData() {
    if (!this.mapData || this.numberOfPersonalBases == 0 || this.shouldLoadMap) {
      this.shouldLoadMap = false;
      await this.nexusService.getMap().then(res => {
        if (res) {
          this.mapData = res;
          this.currentPersonalBases = this.mapData.filter(x => x.user?.id == this.parentRef?.user?.id);
          this.numberOfPersonalBases = this.currentPersonalBases.length ?? 0;
        }
      });
    }
  }
  emittedOpenUserSearch() {
    this.isUserSearchOpen = true; 
    this.parentRef?.showOverlay();

    setTimeout(() => {
      (document.getElementsByClassName("searchUsersSpan")[0] as HTMLButtonElement).click();
    }, 50);
  }
  emittedZoomInEvent() {
    this.hideBaseNavForMap = false;
  }
  emittedZoomOutEvent() {
    this.hideBaseNavForMap = true;
  }
  closeUserSearchOverlay() {
    this.isUserSearchOpen = false; 
    this.parentRef?.closeOverlay(); 
  }
  searchReports($event?: User) {
    if ($event) { 
      this.nexusReportsComponent.searchReports($event);
    }
    this.closeUserSearchOverlay();
  }
  debounceLoadNexusData = this.debounce(async () => {
    this.loadNexusData();
  }, 1000);
  random() { return Math.random(); }
}
