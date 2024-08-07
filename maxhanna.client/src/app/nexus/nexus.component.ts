import {  Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { FileService } from '../../services/file.service';
import { NexusBase } from '../../services/datacontracts/nexus/nexus-base';
import { NexusBaseUpgrades } from '../../services/datacontracts/nexus/nexus-base-upgrades';
 import {  NexusAvailableUpgrades, UpgradeDetail } from '../../services/datacontracts/nexus/nexus-available-upgrades';
 import { User } from '../../services/datacontracts/user/user';
import { UnitStats } from '../../services/datacontracts/nexus/unit-stats';
import { NexusUnits } from '../../services/datacontracts/nexus/nexus-units';
import { NexusUnitsPurchased } from '../../services/datacontracts/nexus/nexus-units-purchased';
import { NexusService } from '../../services/nexus.service';
import { NexusAttackSent } from '../../services/datacontracts/nexus/nexus-attack-sent'; 
import { NexusBattleOutcomeReports } from '../../services/datacontracts/nexus/nexus-battle-outcome-reports';
import { NexusUnitUpgrades } from '../../services/datacontracts/nexus/nexus-unit-upgrades';
import { UnitUpgradeStats } from '../../services/datacontracts/nexus/unit-upgrade-stats';
import { NexusMapComponent } from '../nexus-map/nexus-map.component';
import { BuildingTimer } from '../../services/datacontracts/nexus/building-timer';
import { UnitTimer } from '../../services/datacontracts/nexus/unit-timer';
import { AttackTimer } from '../../services/datacontracts/nexus/attack-timer';
import { ResearchTimer } from '../../services/datacontracts/nexus/research-timer';
import { MiningSpeed } from '../../services/datacontracts/nexus/mining-speed';

@Component({
  selector: 'app-nexus',
  templateUrl: './nexus.component.html',
  styleUrl: './nexus.component.css'
})
export class NexusComponent extends ChildComponent implements OnInit, OnDestroy {
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

  mapTileSrc?: string;
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
  nexusBase?: NexusBase;
  nexusBaseUpgrades?: NexusBaseUpgrades;
  nexusUnits?: NexusUnits;
  nexusAvailableUnits?: NexusUnits;
  nexusUnitsPurchaseList?: NexusUnitsPurchased[];
  nexusUnitUpgrades?: NexusUnitUpgrades[];
  nexusAvailableUpgrades?: UpgradeDetail[];
  currentValidAvailableUpgrades?: UpgradeDetail[];
  nexusAttacksSent?: NexusAttackSent[];
  nexusAttacksIncoming?: NexusAttackSent[];
  units?: UnitStats[];
  unitUpgradeStats?: UnitUpgradeStats[];
  miningSpeeds?: MiningSpeed[];

  buildingTimers: { [key: string]: BuildingTimer } = {};
  unitTimers: { [key: string]: UnitTimer } = {};
  attackTimers: { [key: string]: AttackTimer } = {};
  researchTimers: { [key: string]: ResearchTimer } = {};
  goldIncrementInterval: any;

  numberOfPersonalBases = 0;
  miningSpeed = 0.0;
  goldCapacity = 5000;
  supplyCapacity = 2500;
  factoryUnitsBeingBuilt = 0;
  starportUnitsBeingBuilt = 0;
  factoryUnitIds = [6, 7, 10];
  starportUnitIds = [8, 9, 11];
  warehouseUpgradeLevels: number[] = [];
  glitcherStats = new UnitStats();
  toggledUnitStat?: UnitStats;
  unitsWithoutGlitcher?: UnitStats[];

  @ViewChild('upgradeMineButton') upgradeMineButton!: ElementRef<HTMLButtonElement>;
  @ViewChild('upgradeFactoryButton') upgradeFactoryButton!: ElementRef<HTMLButtonElement>;
  @ViewChild('mapComponentDiv') mapComponentDiv!: ElementRef<HTMLDivElement>;
  @ViewChild(NexusMapComponent) mapComponent!: NexusMapComponent;

  constructor(private fileService: FileService, private nexusService: NexusService) {
    super();
  }

  async ngOnInit() {
    //this.isUserNew = (!this.parentRef || !this.parentRef.user);
    this.isUserComponentOpen = (!this.parentRef || !this.parentRef.user);
    this.warehouseUpgradeLevels = Array.from({ length: 6 }, (_, i) => i + 1);

    this.loadPictureSrcs();
    await this.loadNexusData();
    this.startGoldIncrement();
  }

  ngOnDestroy() {
    this.stopGoldIncrement();
  }

  async start() {
    if (!this.parentRef || !this.parentRef.user) { return alert("You must be logged in to play!"); }
    const startRes = await this.nexusService.start(this.parentRef.user);

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

  async loadNexusData(skipMap: Boolean = false) {
    if (!this.parentRef || !this.parentRef.user) { return; }
    this.startLoading();
    const data = await this.nexusService.getNexus(this.parentRef.user, this.nexusBase);

    if (data && data.nexusBase && data.nexusBase.user?.id != 0) {
      this.nexusBase = data.nexusBase;
      this.nexusBaseUpgrades = data.nexusBaseUpgrades;
      this.nexusUnitsPurchaseList = data.nexusUnitsPurchasedList;
      this.nexusUnits = data.nexusUnits; 
      this.nexusAttacksSent = data.nexusAttacksSent;
      this.nexusUnitUpgrades = data.nexusUnitUpgrades;
      this.nexusAttacksIncoming = data.nexusAttacksIncoming;
      this.nexusBaseUpgrades = data.nexusBaseUpgrades; 
      this.nexusBase.gold = data.nexusBase.gold;
      this.goldCapacity = (data.nexusBase.warehouseLevel + 1) * 5000;
      this.supplyCapacity = (data.nexusBase.supplyDepotLevel * 2500);

      this.nexusAvailableUnits = JSON.parse(JSON.stringify(data.nexusUnits)); //creating a deep copy wont reference the same address as nexusUnits 
      this.currentValidAvailableUpgrades = undefined;
      this.displayBuildings(this.nexusBaseUpgrades);
      this.updateAttackTimers(true);
      this.setAvailableUnits();
      this.getUnitStats();
      this.updateUnitResearchTimers();
      this.getAvailableBuildingUpgrades();
      this.getMiningSpeedsAndSetMiningSpeed();
    }
    if (!this.nexusBase || (this.nexusBase.coordsX == 0 && this.nexusBase.coordsY == 0)) {
      this.isUserComponentOpen = false;
      this.isUserNew = true;
    }

    if (!skipMap || !this.mapData) {
      const mapRes = await this.nexusService.getMap(this.parentRef.user);
      if (mapRes) {
        this.mapData = mapRes;
        this.mapComponent.setMapData(this.mapData);
        this.numberOfPersonalBases = this.mapData.filter(x => x.user?.id == this.parentRef?.user?.id).length;
      }
    }
    this.unitsWithoutGlitcher = undefined;
    this.startGoldIncrement();
    this.stopLoading();
  }
  async getMiningSpeedsAndSetMiningSpeed() {
    if (!this.miningSpeeds) {
      this.miningSpeeds = await this.nexusService.getMiningSpeeds();
    }
    if (this.miningSpeeds) {
      this.miningSpeed = this.miningSpeeds.find(x => x.minesLevel == this.nexusBase?.minesLevel)?.speed ?? 0;
    }
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
  async nextBase() {
    if (!this.mapData || !this.parentRef?.user?.id) return;

    const affectedMapData = this.mapData.filter(x => x.user?.id === this.parentRef?.user?.id);
    if (!affectedMapData || affectedMapData.length === 0) return;

    const index = affectedMapData.findIndex(x => x.coordsX === this.nexusBase?.coordsX && x.coordsY === this.nexusBase?.coordsY);
 
    if (index !== -1 && affectedMapData[index + 1]) {
      this.nexusBase = affectedMapData[index + 1];
    } else {
      this.nexusBase = affectedMapData[0];
    }
    this.loadNexusData(true);
  }

  async previousBase() {
    if (!this.mapData || !this.parentRef?.user?.id) return;

    const affectedMapData = this.mapData.filter(x => x.user?.id === this.parentRef?.user?.id);
    if (!affectedMapData || affectedMapData.length === 0) return;

    const index = affectedMapData.findIndex(x => x.coordsX === this.nexusBase?.coordsX && x.coordsY === this.nexusBase?.coordsY);
 
    if (index !== -1 && affectedMapData[index - 1]) {
      this.nexusBase = affectedMapData[index - 1];
    } else {
      this.nexusBase = affectedMapData[affectedMapData.length - 1];
    }
    this.loadNexusData(true);
  }


  private setAvailableUnits() {
    if (!this.nexusAvailableUnits || !this.nexusBase) return
    if (this.nexusAttacksSent && this.nexusAttacksSent.length > 0) {
      const filteredAttacks = this.nexusAttacksSent.filter(x => x.originCoordsX == this.nexusBase?.coordsX && x.originCoordsY == this.nexusBase.coordsY);
      filteredAttacks.forEach(x => {
        this.nexusAvailableUnits!.marineTotal -= x.marineTotal;
        this.nexusAvailableUnits!.goliathTotal -= x.goliathTotal;
        this.nexusAvailableUnits!.siegeTankTotal -= x.siegeTankTotal;
        this.nexusAvailableUnits!.scoutTotal -= x.scoutTotal;
        this.nexusAvailableUnits!.wraithTotal -= x.wraithTotal;
        this.nexusAvailableUnits!.battlecruiserTotal -= x.battlecruiserTotal;
        this.nexusAvailableUnits!.glitcherTotal -= x.glitcherTotal;
      });
    }
    if (this.nexusAttacksIncoming && this.nexusAttacksIncoming.length > 0) {
      this.nexusAttacksIncoming.forEach(x => {
        if (x.originCoordsX == this.nexusBase!.coordsX && x.originCoordsY == this.nexusBase!.coordsY) {
          this.nexusAvailableUnits!.marineTotal -= x.marineTotal;
          this.nexusAvailableUnits!.goliathTotal -= x.goliathTotal;
          this.nexusAvailableUnits!.siegeTankTotal -= x.siegeTankTotal;
          this.nexusAvailableUnits!.scoutTotal -= x.scoutTotal;
          this.nexusAvailableUnits!.wraithTotal -= x.wraithTotal;
          this.nexusAvailableUnits!.battlecruiserTotal -= x.battlecruiserTotal;
          this.nexusAvailableUnits!.glitcherTotal -= x.glitcherTotal;
        }
      });
    }
  }
  private async getUnitStats(force?: boolean) {
    if (!this.parentRef || !this.parentRef.user || !this.nexusBase) {
      console.log("cant get unit stats, no base present");
      return;
    };
    if (!this.units) {
      this.units = await this.nexusService.getUnitStats(this.parentRef.user, this.nexusBase);
      this.glitcherStats = this.units?.find(x => x.unitType == "glitcher") ?? new UnitStats();
      this.assignPicturesToUnitStats(); 
    }
    
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
      const unit = this.units!.find(x => x.unitType === type);
      if (unit) {
        unit.pictureSrc = pictureSrc;
      }
    });
  }

  private getUnitTimers() {
    this.reinitializeUnitTimers();
    this.factoryUnitsBeingBuilt = 0;
    this.starportUnitsBeingBuilt = 0;
    if (this.nexusUnitsPurchaseList && this.nexusUnitsPurchaseList.length > 0) {
      let count = 0;
      this.nexusUnitsPurchaseList.forEach(x => {
        count++;
        const startTime = x.timestamp;
        const salt = "{" + this.nexusBase?.coordsX + " " + this.nexusBase?.coordsY + "} " + count + "." + x.quantityPurchased + " ";
        if (this.factoryUnitIds.includes(x.unitIdPurchased)) {
          this.factoryUnitsBeingBuilt++;
        } else {
          this.starportUnitsBeingBuilt++;
        }

        this.primeTheTimerForUnitPurchases(startTime, x.unitIdPurchased, x.quantityPurchased, salt);
      });
    }
  }


  private async updateUnitResearchTimers() {
    if (!this.parentRef || !this.parentRef.user) return;
    if (!this.unitUpgradeStats) {
      const unitUpgradeStatsRes = await this.nexusService.getUnitUpgradeStats(this.parentRef.user);
      if (unitUpgradeStatsRes) {
        this.unitUpgradeStats = unitUpgradeStatsRes;
      }
    }
    this.reinitializeResearchTimers();
    if (this.nexusUnitUpgrades && this.nexusUnitUpgrades.length > 0 && this.nexusBase && this.units && this.unitUpgradeStats) {

      this.nexusUnitUpgrades.forEach(x => {

        if (!this.units) return;
        const foundUnit = this.units.find(unit => unit && unit.unitId == x.unitIdUpgraded);

        const startTimeTime = new Date(x.timestamp).getTime();
        const utcNow = new Date().getTime();
        const elapsedTimeInSeconds = Math.floor((utcNow - startTimeTime)) / 1000;
        const unitTimeDuration = this.units!.find(unit => unit && unit.unitId == x.unitIdUpgraded)!.duration;
        type UnitType = "marine" | "goliath" | "battlecruiser" | "wraith" | "siegeTank" | "scout" | "glitcher";

        if (foundUnit && foundUnit.unitType && this.nexusBase) {
          const levelKey = `${foundUnit.unitType}Level` as keyof NexusBase;
          const foundUnitLevel = this.nexusBase[levelKey]; 
          const upgradeMultiplyer = this.unitUpgradeStats!.find(level => level && level.unitLevel == foundUnitLevel)!.duration;
          const remainingTimeInSeconds = (unitTimeDuration * upgradeMultiplyer) - elapsedTimeInSeconds;
          this.startUnitResearchTimer(foundUnit?.unitType ?? "?", remainingTimeInSeconds);
        }
      });
    }
  }

  private updateAttackTimers(forceUpdateDefenceTimers? : boolean) {
    this.reinitializeAttackTimers();

    if (this.nexusAttacksSent && this.nexusAttacksSent.length > 0 && this.nexusBase) {
      let count = 0;
      const uniqueAttacks = new Set<number>(); // Set to keep track of unique attacks
      const relevantAttacksSent = this.nexusAttacksSent.filter(x => x.originCoordsX == this.nexusBase?.coordsX && x.originCoordsY == this.nexusBase.coordsY);
      relevantAttacksSent.forEach(x => {
        const startTimeTime = new Date(x.timestamp).getTime();
        const utcNow = new Date().getTime();
        const elapsedTimeInSeconds = Math.floor((utcNow - startTimeTime)) / 1000;
        const remainingTimeInSeconds = x.duration - elapsedTimeInSeconds;
        count++;
        const coordsMatchOwnBase = (x.destinationCoordsX == this.nexusBase!.coordsX && x.destinationCoordsY == this.nexusBase!.coordsY);
        if (!coordsMatchOwnBase) {
          const salt = `{${x.originCoordsX},${x.originCoordsY}} ${count}. ${coordsMatchOwnBase ? "Returning" : "Attacking"} {${x.destinationCoordsX},${x.destinationCoordsY}}`;
          if (!uniqueAttacks.has(remainingTimeInSeconds) && !this.attackTimers[salt]) {
            uniqueAttacks.add(remainingTimeInSeconds);
            this.startAttackTimer(salt, remainingTimeInSeconds); 
          }
        }
      });
    }
    if (forceUpdateDefenceTimers) {
      this.updateDefenceTimers(); 
    }
  }

  private updateDefenceTimers() {
    if (this.nexusAttacksIncoming && this.nexusAttacksIncoming.length > 0) {
      let count = 0;
      const uniqueDefenses = new Set<string>(); // Set to keep track of unique defenses
      const relevantAttacksReceived = this.nexusAttacksIncoming.filter(x => x.destinationCoordsX == this.nexusBase?.coordsX && x.destinationCoordsY == this.nexusBase.coordsY && x.originUserId != this.parentRef?.user?.id); 
      relevantAttacksReceived.forEach(x => {
        const startTimeTime = new Date(x.timestamp).getTime();
        const utcNow = new Date().getTime();
        const elapsedTimeInSeconds = Math.floor((utcNow - startTimeTime)) / 1000;
        const remainingTimeInSeconds = x.duration - elapsedTimeInSeconds;
        count++;
        const returningToBase = (x.originCoordsX == this.nexusBase?.coordsX && x.originCoordsY == this.nexusBase.coordsY);
        const salt = returningToBase ? `{${x.destinationCoordsX},${x.destinationCoordsY}} ${count}. Returning {${x.originCoordsX},${x.originCoordsY}}`
          : `{${x.destinationCoordsX},${x.destinationCoordsY}} ${count}. Incoming {${x.originCoordsX},${x.originCoordsY}}`;

        if (remainingTimeInSeconds > 0) {
          if (!uniqueDefenses.has(salt)) {
            uniqueDefenses.add(salt);
            this.startAttackTimer(salt, remainingTimeInSeconds); 
          }
        }
      }); 
    }
  }



  debounceLoadNexusData = this.debounce(async () => {
    await this.loadNexusData();
  }, 1000);



  private startUpgradeTimer(upgrade: string, time: number, isUnit: boolean) {
    if ((isUnit && this.unitTimers[upgrade]) || (!isUnit && this.buildingTimers[upgrade]) || !time || isNaN(time)) {
      return;
    }

    const endTime = Math.max(0, time) + 1;
    let timerObject: any;

    const timer = {
      endTime: endTime,
      timeout: setTimeout(async () => {

        this.addNotification(`${upgrade} ${isUnit ? '' : 'upgrade '}completed!`);
        if (!this.nexusUnits) {
          this.nexusUnits = {} as NexusUnits;
        }
        if (!this.nexusAvailableUnits) {
          this.nexusAvailableUnits = { } as NexusUnits;
        }
        if (isUnit) {
          delete this.unitTimers[upgrade];
          const subs = upgrade.split('.')[1];
          const count = parseInt(subs.split(' ')[0]);
          const unitType = subs.split(' ')[1];
          console.log("count: " + count + "; unitType:" + unitType);
          if (unitType.includes("marine")) {
            this.nexusUnits.marineTotal += count;
            this.nexusAvailableUnits.marineTotal += count;
          } else if (unitType.includes("goliath")) {
            this.nexusUnits.goliathTotal += count;
            this.nexusAvailableUnits.goliathTotal += count; 
          } else if (unitType.includes("siege_tank")) {
            this.nexusUnits.siegeTankTotal += count;
            this.nexusAvailableUnits.siegeTankTotal += count;
          } else if (unitType.includes("scout")) {
            this.nexusUnits.scoutTotal += count;
            this.nexusAvailableUnits.scoutTotal += count;
          } else if (unitType.includes("wraith")) {
            this.nexusUnits.wraithTotal += count;
            this.nexusAvailableUnits.wraithTotal += count;
          } else if (unitType.includes("battlecruiser")) {
            this.nexusUnits.battlecruiserTotal += count;
            this.nexusAvailableUnits.battlecruiserTotal += count;
          } else if (unitType.includes("glitcher")) {
            this.nexusUnits.glitcherTotal += count;
            this.nexusAvailableUnits.glitcherTotal += count;
          }
        } else {
          delete this.buildingTimers[upgrade];
          if (this.nexusBase) {
            const buildingType = upgrade.split(' ')[2];
            if (buildingType == "command_center") {
              this.nexusBase.commandCenterLevel++;
            } else if (buildingType == "engineering_bay") {
              this.nexusBase.engineeringBayLevel++;
            } else if (buildingType == "mines") {
              this.nexusBase.minesLevel++;
              this.getMiningSpeedsAndSetMiningSpeed()
              this.startGoldIncrement();
            } else if (buildingType == "warehouse") {
              this.nexusBase.warehouseLevel++;
            } else if (buildingType == "supply_depot") {
              this.nexusBase.supplyDepotLevel++;
            } else if (buildingType == "factory") {
              this.nexusBase.factoryLevel++;
            } else if (buildingType == "starport") {
              this.nexusBase.starportLevel++;
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
      this.unitTimers[upgrade] = timer;
    } else {
      this.buildingTimers[upgrade] = timer;
    }

    timerObject = timer;
  }

  private startAttackTimer(attack: string, time: number) {
    if (this.attackTimers[attack] || !time || isNaN(time)) {
      return;
    }

    const endTime = Math.max(1, time);
    const timer = {
      endTime: endTime,
      timeout: setTimeout(async () => {
        this.addNotification(`${attack} completed!`);
        clearInterval(this.attackTimers[attack].interval);
        clearTimeout(this.attackTimers[attack].timeout); 
        delete this.attackTimers[attack];
        this.debounceLoadNexusData();
      }, endTime * 1000),
      interval: setInterval(() => {
        if (this.attackTimers[attack]) {
          this.attackTimers[attack].endTime--;
        }
      }, 1000)
    };

    this.attackTimers[attack] = timer;
  }

  private startUnitResearchTimer(research: string, time: number) {
    if (this.researchTimers[research] || !time || isNaN(time)) {
      return;
    }
    console.log(research);
    const endTime = Math.max(1, time);
    const timer = {
      endTime: endTime,
      timeout: setTimeout(async () => {
        this.addNotification(`${research} research completed!`);
        clearInterval(this.researchTimers[research].interval);
        clearTimeout(this.researchTimers[research].timeout);
        delete this.researchTimers[research];
        const unitId = this.getUnitIdFromType(research);
        this.nexusUnitUpgrades?.filter(x => x.unitIdUpgraded == unitId);  
      }, endTime * 1000),
      interval: setInterval(() => {
        if (this.researchTimers[research]) {
          this.researchTimers[research].endTime--;
        }
      }, 1000)
    };

    this.researchTimers[research] = timer;
  }


  private getBuildingUpgradesInfo() {
    if (!this.parentRef || !this.parentRef.user || !this.nexusBase) return;
    this.reinitializeBuildingTimers();

    if (this.nexusBaseUpgrades) {
      if (this.nexusBaseUpgrades.commandCenterUpgraded && !this.buildingTimers["command_center"]) {
        const startTime = this.nexusBaseUpgrades.commandCenterUpgraded;
        this.primeTheTimerForBuildingUgrades(startTime, "command_center");
      }
      if (this.nexusBaseUpgrades.supplyDepotUpgraded && !this.buildingTimers["supply_depot"]) {
        const startTime = this.nexusBaseUpgrades.supplyDepotUpgraded;
        this.primeTheTimerForBuildingUgrades(startTime, "supply_depot");
      }
      if (this.nexusBaseUpgrades.factoryUpgraded && !this.buildingTimers["factory"]) {
        const startTime = this.nexusBaseUpgrades.factoryUpgraded;
        this.primeTheTimerForBuildingUgrades(startTime, "factory");
      }
      if (this.nexusBaseUpgrades.starportUpgraded && !this.buildingTimers["starport"]) {
        const startTime = this.nexusBaseUpgrades.starportUpgraded;
        this.primeTheTimerForBuildingUgrades(startTime, "starport");
      }
      if (this.nexusBaseUpgrades.minesUpgraded && !this.buildingTimers["mines"]) {
        const startTime = this.nexusBaseUpgrades.minesUpgraded;
        this.primeTheTimerForBuildingUgrades(startTime, "mines");
      }
      if (this.nexusBaseUpgrades.engineeringBayUpgraded && !this.buildingTimers["engineering_bay"]) {
        const startTime = this.nexusBaseUpgrades.engineeringBayUpgraded;
        this.primeTheTimerForBuildingUgrades(startTime, "engineering_bay");
      }
      if (this.nexusBaseUpgrades.warehouseUpgraded && !this.buildingTimers["warehouse"]) {
        const startTime = this.nexusBaseUpgrades.warehouseUpgraded;
        this.primeTheTimerForBuildingUgrades(startTime, "warehouse");
      }
    }
  }

  private primeTheTimerForBuildingUgrades(startTime: Date, type: string) {
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
        this.startUpgradeTimer(salt + type, remainingTimeInSeconds, false);
      }
    }
    
  }



  private primeTheTimerForUnitPurchases(startTime: Date, id: number, quantity: number, displayFirst: string) {
    if (!this.units) return;
    const startTimeTime = new Date(startTime).getTime();
    const unit = this.units.find(u => u.unitId === id);
    const duration = unit ? unit.duration * quantity : 0;
    const type = displayFirst + (unit ? unit.unitType : "");

    const utcNow = new Date().getTime();
    const elapsedTimeInSeconds = Math.floor((utcNow - startTimeTime)) / 1000;
    const remainingTimeInSeconds = duration - elapsedTimeInSeconds;

    if (remainingTimeInSeconds > 0) {
      this.startUpgradeTimer(type, remainingTimeInSeconds + 1, true);
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
  private async reinitializeAttackTimers() {
    Object.keys(this.attackTimers).forEach(attack => {
      if (this.attackTimers[attack]) { 
        clearInterval(this.attackTimers[attack].interval);
        clearTimeout(this.attackTimers[attack].timeout);
        delete this.attackTimers[attack];
      }
    });
    this.attackTimers = {};
  }

  private async reinitializeResearchTimers() {
    Object.keys(this.researchTimers).forEach(research => {
      if (this.researchTimers[research]) {
        clearInterval(this.researchTimers[research].interval);
        clearTimeout(this.researchTimers[research].timeout);
        delete this.researchTimers[research];
      }
    });
    this.researchTimers = {};
  }

  private displayBuildings(nexusBaseUpgrades: NexusBaseUpgrades, value?: boolean) {
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

    if (!this.nexusBase) return;
    this.displayMines = !!(nexusBaseUpgrades.minesUpgraded || this.nexusBase.minesLevel > 0);
    this.displayFactory = !!(nexusBaseUpgrades.factoryUpgraded || this.nexusBase.factoryLevel > 0);
    this.displayStarport = !!(nexusBaseUpgrades.starportUpgraded || this.nexusBase.starportLevel > 0);
    this.displaySupplyDepot = !!(nexusBaseUpgrades.supplyDepotUpgraded || this.nexusBase.supplyDepotLevel > 0);
    this.displayWarehouse = !!(nexusBaseUpgrades.warehouseUpgraded || this.nexusBase.warehouseLevel > 0);
    this.displayEngineeringBay = !!(nexusBaseUpgrades.engineeringBayUpgraded || this.nexusBase.engineeringBayLevel > 0);
  }

  async upgradeBuilding(upgrade: UpgradeDetail, duration: number) {
    if (this.parentRef && this.parentRef.user && this.nexusBase && this.nexusAvailableUpgrades) {

      if (this.getBuildingCountersLength() >= this.nexusBase.commandCenterLevel + 1) {
        return alert("Upgrade your Command Center for more worker slots");
      } else if (this.getBuildingTimerForBuilding(upgrade.building)) {
        return alert("You must wait until the upgrade finishes");
      }
       
      this.startLoading();
      let upgradeCost = 0; 
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

      try { 
        switch (upgrade.building) {
          case 'mines':
            upgradeCost = this.nexusAvailableUpgrades.find(x => this.nexusBase && x.building == "mines" && x.nextLevel == this.nexusBase.minesLevel)?.cost ?? 0 
            if (!this.isUpgradeAffordable(upgradeCost, upgrade)) {
              return;
            } 
            this.nexusBaseUpgrades.minesUpgraded = new Date();
            this.nexusService.upgradeMines(this.parentRef.user, this.nexusBase);
            break;
          case 'starport':
            upgradeCost = this.nexusAvailableUpgrades.find(x => this.nexusBase && x.building == "starport" && x.nextLevel == this.nexusBase.starportLevel)?.cost ?? 0
            if (!this.isUpgradeAffordable(upgradeCost, upgrade)) {
              return;
            } 
            this.nexusBaseUpgrades.starportUpgraded = new Date();
            this.nexusService.upgradeStarport(this.parentRef.user, this.nexusBase);
            break;
          case 'factory':
            upgradeCost = this.nexusAvailableUpgrades.find(x => this.nexusBase && x.building == "factory" && x.nextLevel == this.nexusBase.factoryLevel)?.cost ?? 0
            if (!this.isUpgradeAffordable(upgradeCost, upgrade)) {
              return;
            } 
            this.nexusBaseUpgrades.factoryUpgraded = new Date();
            this.nexusService.upgradeFactory(this.parentRef.user, this.nexusBase);
            break;
          case 'engineering_bay':
            upgradeCost = this.nexusAvailableUpgrades.find(x => this.nexusBase && x.building == "engineering_bay" && x.nextLevel == this.nexusBase.engineeringBayLevel)?.cost ?? 0
            if (!this.isUpgradeAffordable(upgradeCost, upgrade)) {
              return;
            } 
            this.nexusBaseUpgrades.engineeringBayUpgraded = new Date();
            this.nexusService.upgradeEngineeringBay(this.parentRef.user, this.nexusBase);
            break;
          case 'warehouse':
            upgradeCost = this.nexusAvailableUpgrades.find(x => this.nexusBase && x.building == "warehouse" && x.nextLevel == this.nexusBase.warehouseLevel)?.cost ?? 0
            if (!this.isUpgradeAffordable(upgradeCost, upgrade)) {
              return;
            } 
            this.nexusBaseUpgrades.warehouseUpgraded = new Date();
            this.nexusService.upgradeWarehouse(this.parentRef.user, this.nexusBase);
            break;
          case 'supply_depot':
            upgradeCost = this.nexusAvailableUpgrades.find(x => this.nexusBase && x.building == "supply_depot" && x.nextLevel == this.nexusBase.supplyDepotLevel)?.cost ?? 0
            if (!this.isUpgradeAffordable(upgradeCost, upgrade)) {
              return;
            } 
            this.nexusBaseUpgrades.supplyDepotUpgraded = new Date();
            this.nexusService.upgradeSupplyDepot(this.parentRef.user, this.nexusBase);
            break;
          case 'command_center':
            upgradeCost = this.nexusAvailableUpgrades.find(x => this.nexusBase && x.building == "command_center" && x.nextLevel == this.nexusBase.commandCenterLevel)?.cost ?? 0
            if (!this.isUpgradeAffordable(upgradeCost, upgrade)) {
              return;
            } 
            this.nexusBaseUpgrades.commandCenterUpgraded = new Date();
            this.nexusService.upgradeCommandCenter(this.parentRef.user, this.nexusBase);
            break;
          default:
            alert("Unknown building type");
            return;
        }

        this.displayBuildings(this.nexusBaseUpgrades);
        this.nexusBase.gold -= upgradeCost;
        if (this.mapData && this.nexusBase) {
          this.mapData.find(x => x.coordsX == this.nexusBase!.coordsX && x.coordsY == this.nexusBase!.coordsY)!.gold = this.nexusBase.gold; 
        }
        this.addNotification(`{${this.nexusBase.coordsX},${this.nexusBase.coordsY}} Upgrading ${upgrade.building}`);
        this.getBuildingUpgradesInfo();
       
      } catch (error) {
        console.error('Error during upgrade:', error);
        alert('An error occurred during the upgrade process.');
      } finally {
        // Stop loading indicator
        this.stopLoading();
      } 
    } 
  }

    private isUpgradeAffordable(upgradeCost: number, upgrade: UpgradeDetail) {
      if (this.nexusBase && (this.nexusBase.gold - upgradeCost) < 0) {
        this.addNotification(`{${this.nexusBase.coordsX},${this.nexusBase.coordsY}} Not enough gold to upgrade ${upgrade.building}`);
        return false;
      } else if (!this.nexusBase) return false;
      return true;
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
    if ((this.nexusBase.gold - totalCost) < 0) {
      this.addNotification(`Not enough gold to buy ${tmpUnit.purchasedValue} ${tmpUnit.unitType}.`); 
    }
    else if (tmpUnit.unitType == "glitcher" && (this.nexusUnits && this.nexusUnits.glitcherTotal > 0)) {
      this.addNotification(`You cannot have more then one glitcher per base.`);  
    }
    else {
      this.nexusBase.gold -= totalCost; 
      this.addNotification(`Purchased ${tmpUnit.purchasedValue} ${tmpUnit.unitType}.`);
      const purchasedUnit = {
        coords_x : this.nexusBase.coordsX,
        coords_y: this.nexusBase.coordsY,
        unitIdPurchased: unitId,
        quantityPurchased: tmpUnit.purchasedValue,
        timestamp: new Date(),

      } as NexusUnitsPurchased;
      if (!this.nexusUnitsPurchaseList) { this.nexusUnitsPurchaseList = []; }
      this.nexusUnitsPurchaseList.push(purchasedUnit);
      if (this.mapData) {
        this.mapData.find(x => x.coordsX == this.nexusBase?.coordsX && x.coordsY == this.nexusBase?.coordsY)!.gold = this.nexusBase.gold; 
      }
      this.getUnitTimers();
      this.nexusService.purchaseUnit(this.parentRef.user, this.nexusBase, tmpUnit.unitId, tmpUnit.purchasedValue ?? 0);
    }

     
    if (this.units) {
      this.units.forEach(x => {
        x.purchasedValue = undefined;
      });
    }
    this.stopLoading(); 
  }

  async viewMap(force?: boolean, dontScroll: boolean = false) {
    this.isMapOpen = force != undefined ? force : !this.isMapOpen;
    if (this.isMapOpen && this.nexusBase && !dontScroll) {
      setTimeout(() => { if (this.nexusBase) this.mapComponent.scrollToCoordinates(this.nexusBase.coordsX, this.nexusBase.coordsY); }, 10);
    }
  }

  startGoldIncrement() {
    if (this.goldIncrementInterval) {
      clearInterval(this.goldIncrementInterval);
    }

    const intervalTime = this.miningSpeed * 1000;

    this.goldIncrementInterval = setInterval(() => {
      if (this.miningSpeed && this.nexusBase && (this.nexusBase.gold < this.goldCapacity)) {
          this.nexusBase.gold++; 
        }
      }, intervalTime); 
  }

  calculateCurrentSupply() {
    if (!this.nexusBase) return 0;
    return this.supplyCapacity - this.nexusBase.supply
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
  activeUnitTimers(): { unit: string; endTime: number }[] {
    const activeTimers: { unit: string; endTime: number }[] = [];
    this.unitTimers = Object.fromEntries(Object.entries(this.unitTimers).sort(([, a], [, b]) => a.endTime - b.endTime));

    for (const unit in this.unitTimers) {
      const timer = this.unitTimers[unit];
      if (timer.endTime) {
        activeTimers.push({ unit: unit, endTime: timer.endTime });
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

  activeAttackTimers(): { unit: string; endTime: number }[] {
    const activeTimers: { unit: string; endTime: number }[] = [];
    this.attackTimers = Object.fromEntries(Object.entries(this.attackTimers).sort(([, a], [, b]) => a.endTime - b.endTime));

    for (const unit in this.attackTimers) {
      const timer = this.attackTimers[unit];
      if (timer.endTime) {
        activeTimers.push({ unit: unit, endTime: timer.endTime });
      }
    }

    return activeTimers;
  }

  async closeUserComponent(user: User) {
    if (!this.parentRef) return;
    this.parentRef.user = user;
    this.isUserComponentOpen = false;
    await this.loadNexusData();
  }
  openCommandCenter() {
    this.isCommandCenterOpen = true;
  }
  closeCommandCenter() {
    this.isCommandCenterOpen = false;
  }
  openMines() {
    this.isMinesOpen = true;
  }
  closeMines() {
    this.isMinesOpen = false;
  }

  openFactory() {
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
    this.isSupplyDepotOpen = true;
  }
  closeSupplyDepot() {
    this.isSupplyDepotOpen = false;
  }
  openEngineeringBay() {
    this.isEngineeringBayOpen = true;
  }
  closeEngineeringBay() {
    this.isEngineeringBayOpen = false;
  }
  openWarehouse() {
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
          x.building == "mines" && x.nextLevel == 1
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
  maxSliderValue(unit: UnitStats): number {
    if (!this.nexusBase) return 0;
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

    if (this.nexusAttacksSent) {
      this.nexusAttacksSent.forEach(attack => {
        switch (unit.unitType) {
          case "marine":
            totalSupplyUsed += unit.supply * (attack.marineTotal ?? 0);
            break;
          case "goliath":
            totalSupplyUsed += unit.supply * (attack.goliathTotal ?? 0);
            break;
          case "siege_tank":
            totalSupplyUsed += unit.supply * (attack.siegeTankTotal ?? 0);
            break;
          case "scout":
            totalSupplyUsed += unit.supply * (attack.scoutTotal ?? 0);
            break;
          case "wraith":
            totalSupplyUsed += unit.supply * (attack.wraithTotal ?? 0);
            break;
          case "battlecruiser":
            totalSupplyUsed += unit.supply * (attack.battlecruiserTotal ?? 0);
            break;
          case "glitcher":
            totalSupplyUsed += unit.supply * (attack.glitcherTotal ?? 0);
            break;
          default:
            break;
        }
      });
    }

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
    s = s.substring(s.indexOf('}') + 1, s.length).replace('_', ' ');
    s = s.substring(s.indexOf('.') + 1, s.length);

    return s;
  }
  getXCoordsFromTimer(s: string) {
    console.log("getting x coords from timer");
    console.log(s);
    console.log(parseInt(s.substring(s.indexOf('{') + 1, s.indexOf(','))))
    return parseInt(s.substring(s.indexOf('{') + 1, s.indexOf(',')));
  }
  getYCoordsFromTimer(s: string) {
    return parseInt(s.substring(s.indexOf(',') + 1, s.indexOf('}')));
  }
  getBuildingTimerForBuilding(building: string) {
    const formatted = "{" + this.nexusBase?.coordsX + " " + this.nexusBase?.coordsY + "} " + this.formatBuildingTimer(building).toLowerCase().replace(" ", "_");

    return this.buildingTimers[formatted];
  }

  private loadPictureSrcs() {
    
    if (!this.cclvl1Src) {
      this.fileService.getFileSrcByFileId(6546)
        .then(src => {
          this.cclvl1Src = src; 
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }
    if (!this.cclvl2Src) {
      this.fileService.getFileSrcByFileId(6547)
        .then(src => {
          this.cclvl2Src = src; 
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }
    if (!this.cclvl3Src) {
      this.fileService.getFileSrcByFileId(6544)
        .then(src => {
          this.cclvl3Src = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }
 
    if (!this.splvl1Src) {
      this.fileService.getFileSrcByFileId(6567)
        .then(src => {
          this.splvl1Src = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }
    if (!this.splvl2Src) {
      this.fileService.getFileSrcByFileId(6565)
        .then(src => {
          this.splvl2Src = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }
    if (!this.splvl3Src) {
      this.fileService.getFileSrcByFileId(6566)
        .then(src => {
          this.splvl3Src = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }
 
    if (!this.mineslvl1Src) {
      this.fileService.getFileSrcByFileId(6551)
        .then(src => {
          this.mineslvl1Src = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }
    if (!this.mineslvl2Src) {
      this.fileService.getFileSrcByFileId(6549)
        .then(src => {
          this.mineslvl2Src = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }
    if (!this.mineslvl3Src) {
      this.fileService.getFileSrcByFileId(6553)
        .then(src => {
          this.mineslvl3Src = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }

  
    if (!this.flvl1Src) {
      this.fileService.getFileSrcByFileId(6550)
        .then(src => {
          this.flvl1Src = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }
    if (!this.flvl2Src) {
      this.fileService.getFileSrcByFileId(6554)
        .then(src => {
          this.flvl2Src = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }
    if (!this.flvl3Src) {
      this.fileService.getFileSrcByFileId(6552)
        .then(src => {
          this.flvl3Src = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }
 
    if (!this.sdlvl1Src) {
      this.fileService.getFileSrcByFileId(6555)
        .then(src => {
          this.sdlvl1Src = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }

    if (!this.sdlvl2Src) {
      this.fileService.getFileSrcByFileId(6557)
        .then(src => {
          this.sdlvl2Src = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }

    if (!this.sdlvl3Src) {
      this.fileService.getFileSrcByFileId(6559)
        .then(src => {
          this.sdlvl3Src = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }
     

    if (!this.whlvl1Src) {
      this.fileService.getFileSrcByFileId(6562)
        .then(src => {
          this.whlvl1Src = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }
    if (!this.whlvl2Src) {
      this.fileService.getFileSrcByFileId(6563)
        .then(src => {
          this.whlvl2Src = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }
    if (!this.whlvl3Src) {
      this.fileService.getFileSrcByFileId(6564)
        .then(src => {
          this.whlvl3Src = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }
     
    if (!this.eblvl1Src) {
      this.fileService.getFileSrcByFileId(6545)
        .then(src => {
          this.eblvl1Src = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }

    if (!this.eblvl2Src) {
      this.fileService.getFileSrcByFileId(6548)
        .then(src => {
          this.eblvl2Src = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }

    if (!this.eblvl3Src) {
      this.fileService.getFileSrcByFileId(6543)
        .then(src => {
          this.eblvl3Src = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }

    if (!this.nexusBackgroundPictureSrc) {
      this.fileService.getFileSrcByFileId(6556)
        .then(src => {
          this.nexusBackgroundPictureSrc = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }

    if (!this.nexusLevel1Src) {
      this.fileService.getFileSrcByFileId(6570)
        .then(src => {
          this.nexusLevel1Src = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }

    if (!this.nexusLevel2Src) {
      this.fileService.getFileSrcByFileId(6569)
        .then(src => {
          this.nexusLevel2Src = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }

    if (!this.nexusLevel3Src) {
      this.fileService.getFileSrcByFileId(6568)
        .then(src => {
          this.nexusLevel3Src = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }

    if (!this.mapTileSrc) {
      this.fileService.getFileSrcByFileId(6293)
        .then(src => {
          this.mapTileSrc = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }
    if (!this.marinePictureSrc) {
      this.fileService.getFileSrcByFileId(6240)
        .then(src => {
          this.marinePictureSrc = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }
    if (!this.goliathPictureSrc) {
      this.fileService.getFileSrcByFileId(6237)
        .then(src => {
          this.goliathPictureSrc = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }
    if (!this.siegeTankPictureSrc) {
      this.fileService.getFileSrcByFileId(6246)
        .then(src => {
          this.siegeTankPictureSrc = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }
    if (!this.scoutPictureSrc) {
      this.fileService.getFileSrcByFileId(6244)
        .then(src => {
          this.scoutPictureSrc = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }
    if (!this.wraithPictureSrc) {
      this.fileService.getFileSrcByFileId(6245)
        .then(src => {
          this.wraithPictureSrc = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }
    if (!this.battlecruiserPictureSrc) {
      this.fileService.getFileSrcByFileId(6243)
        .then(src => {
          this.battlecruiserPictureSrc = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }
    if (!this.glitcherPictureSrc) {
      this.fileService.getFileSrcByFileId(6261)
        .then(src => {
          this.glitcherPictureSrc = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }
  }
  toggleScreen(screen: string, isOpen?: boolean) {
    this.isMinesOpen = false;
    this.isCommandCenterOpen = false;
    this.isStarportOpen = false;
    this.isFactoryOpen = false;
    this.isMinesOpen = false;
    this.isWarehouseOpen = false;
    this.isEngineeringBayOpen = false;
    this.isReportsOpen = false;
    this.isMapOpen = false;
    this.isBasesOpen = false;
    this.toggleUnitScreen();

    if (screen == "reports") {
      this.isReportsOpen = isOpen != undefined ? isOpen : !this.isReportsOpen;
    }
    else if (screen == "map") {
      this.viewMap(isOpen);
    }
    else if (screen == "bases") {
      this.isBasesOpen = isOpen != undefined ? isOpen : !this.isBasesOpen;
    }
  }
  toggleUnitScreen(unit?: UnitStats, isOpen?: boolean) {
    if (isOpen == false) {
      this.toggledUnitStat = undefined;
    } else {
      this.toggledUnitStat = unit;
    }
  }
  getGlitcherStats() {
    if (this.units)
      return this.units.find(x => x.unitType == "glitcher");
    else return undefined;
  }
  addNotification(notif?: string) {
    if (notif) {
      this.notifications.push(notif);
      setTimeout(() => {
        this.notifications.shift();
      }, 9000);
    }
  }
  toggleUnitScreenFromBaseUnits(unit: string) {
    if (!this.units) return;
    const unitStat = this.units.find(x => x.unitType == unit);
    this.toggleUnitScreen(unitStat);
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
    if (this.getEngineerBayUpgradeLimit() <= Object.keys(this.activeResearchTimers).length) {
      return alert("Upgrade the Engineering Bay for more research upgrades.");
    }
    if (this.parentRef && this.parentRef.user && this.nexusBase) {
      const res = await this.nexusService.research(this.parentRef.user, this.nexusBase, unit);
      if (res) {
        this.addNotification(res);
        await this.loadNexusData(true);
      }
    }
  }

  getEngineerBayUpgradeLimit() {
    if (!this.nexusBase) return 0;
    return Math.round(this.nexusBase.engineeringBayLevel / 2)
  }
  getUnitIdFromType(type: string) {
    return type == "marine" ? 6 : type == "goliath" ? 7 : type == "battlecruiser" ? 8 : type == "wraith" ? 9 : type == "siege_tank" ? 10 : type == "scout" ? 11 : type == "glitcher" ? 12 : 0;
  }
  openMapAndScrollTo(timer: string) {
    const x = this.getXCoordsFromTimer(this.formatBuildingTimer(timer));
    const y = this.getYCoordsFromTimer(this.formatBuildingTimer(timer));
    this.viewMap(true, true);
    this.mapComponent.selectCoordinates(x, y);
    setTimeout(() => { this.mapComponent.scrollToCoordinates(this.mapComponent.selectedNexusBase!.coordsX, this.mapComponent.selectedNexusBase!.coordsY); }, 10); 
  }
  async emittedGoToBaseEvent(nexusBase?: NexusBase) {
    console.log("emitted go to base");
    this.nexusBase = nexusBase;
    await this.loadNexusData(true);
    this.toggleScreen("map", false);
  }
  emittedReloadEvent(reason: string) {
    console.log("emitted reload event " + reason);
    this.loadNexusData(false);
  }
  emittedNotifications(message: string) {
    if (!message || message.trim() == "") return;
    this.addNotification(message);
  }
  async emittedBaseChange(changedBase: NexusBase) {
    if (this.nexusBase && (changedBase.coordsX != this.nexusBase.coordsX || changedBase.coordsY != this.nexusBase.coordsY)) {
      this.nexusBase = changedBase;
      this.loadNexusData(true);
    }
    this.isBasesOpen = false;
  }
  emittedAttackEvent(attack: NexusAttackSent) {
    if (!attack) return;
    if (!this.nexusAttacksSent) { this.nexusAttacksSent = []; }
    this.nexusAttacksSent.push(attack);
    this.updateAttackTimers(false);
  }
}
