import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { FileService } from '../../services/file.service';
 import { NexusBase } from '../../services/datacontracts/nexus/nexus-base';
import { NexusBaseUpgrades } from '../../services/datacontracts/nexus/nexus-base-upgrades';
import { NexusMapComponent } from '../nexus-map/nexus-map.component';
import { NexusAvailableUpgrades, UpgradeDetail } from '../../services/datacontracts/nexus/nexus-available-upgrades';
import { BuildingTimer } from '../../services/datacontracts/nexus/building-timer';
import { User } from '../../services/datacontracts/user/user';
import { UnitStats } from '../../services/datacontracts/nexus/unit-stats';
import { NexusUnits } from '../../services/datacontracts/nexus/nexus-units';
import { NexusUnitsPurchased } from '../../services/datacontracts/nexus/nexus-units-purchased';
import { NexusService } from '../../services/nexus.service';
import { NexusAttackSent } from '../../services/datacontracts/nexus/nexus-attack-sent';
import { NexusBattleOutcome } from '../../services/datacontracts/nexus/nexus-battle-outcome';
import { NexusBattleOutcomeReports } from '../../services/datacontracts/nexus/nexus-battle-outcome-reports';

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
  isReportsOpen = false;
  isUserNew = false;
  displayCommandCenter = false;
  displayMines = false;
  displayFactory = false;
  displayStarport = false;
  displaySupplyDepot = false;
  displayWarehouse = false;
  displayEngineeringBay = false;

  mapTileSrc?: string;
  nexusBackgroundPictureSrc?: string;
  commandCenterPictureSrc?: string;
  starportPictureSrc?: string;
  supplyDepotPictureSrc?: string;
  warehousePictureSrc?: string;
  engineeringBayPictureSrc?: string;
  minesPictureSrc?: string;
  factoryPictureSrc?: string;
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
  nexusAvailableUpgrades?: UpgradeDetail[];
  nexusAttacksSent?: NexusAttackSent[];
  nexusAttacksIncoming?: NexusAttackSent[];
  units?: UnitStats[]; 
  battleReports?: NexusBattleOutcomeReports;

  buildingTimers: { [key: string]: BuildingTimer } = {};
  unitTimers: { [key: string]: BuildingTimer } = {};
  attackTimers: { [key: string]: BuildingTimer } = {};
  goldIncrementInterval: any;

  currentBaseLocationX = 0;
  currentBaseLocationY = 0;
  goldAmount = 200;
  nexusLevel = 0;
  supplyDepotLevel = 0;
  warehouseLevel = 0;
  engineeringBayLevel = 0;
  starportLevel = 0;
  factoryLevel = 0;
  miningSpeed = 0.0;
  goldCapacity = 5000;
  supplyCapacity = 2500;
  factoryUnitsBeingBuilt = 0;
  starportUnitsBeingBuilt = 0; 
  factoryUnitIds = [6, 7, 10];
  starportUnitIds = [8, 9, 11];
  warehouseUpgradeLevels: number[] = [];
  glitcherStats = new UnitStats();


  @ViewChild('upgradeMineButton') upgradeMineButton!: ElementRef<HTMLButtonElement>;
  @ViewChild('upgradeFactoryButton') upgradeFactoryButton!: ElementRef<HTMLButtonElement>;
  @ViewChild('mapComponentDiv') mapComponentDiv!: ElementRef<HTMLDivElement>;
  @ViewChild(NexusMapComponent) mapComponent!: NexusMapComponent;

  constructor(private fileService: FileService, private nexusService: NexusService, private cd: ChangeDetectorRef) {
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
      }
      this.isUserNew = false;
      await this.loadNexusData();
    }
  }

  async loadNexusData(skipMap: Boolean = false) {
    if (!this.parentRef || !this.parentRef.user) { return; }
    const data = await this.nexusService.getNexus(this.parentRef.user, this.nexusBase);

    if (data && data.nexusBase && data.nexusBase.user?.id != 0) {
      this.nexusBase = data.nexusBase;
      this.nexusBaseUpgrades = data.nexusBaseUpgrades;
      this.nexusUnitsPurchaseList = data.nexusUnitsPurchasedList;
      this.nexusUnits = data.nexusUnits; 
      this.nexusAvailableUnits = JSON.parse(JSON.stringify(data.nexusUnits)); //creating a deep copy wont reference the same address as nexusUnits
      this.nexusAvailableUpgrades = data.availableUpgrades;  
      this.nexusAttacksSent = data.nexusAttacksSent;
      this.nexusAttacksIncoming = data.nexusAttacksIncoming;
      this.miningSpeed = data.miningSpeed;
      this.nexusBaseUpgrades = data.nexusBaseUpgrades;
      this.battleReports = data.battleReports; 
      this.currentBaseLocationX = data.nexusBase.coordsX;
      this.currentBaseLocationY = data.nexusBase.coordsY;
      this.goldAmount = data.nexusBase.gold;
      this.goldCapacity = (data.nexusBase.warehouseLevel + 1) * 5000;
      this.supplyCapacity = (data.nexusBase.supplyDepotLevel * 2500);
      this.displayBuildings(this.nexusBaseUpgrades); 
      this.updateAttackTimers();
      this.setAvailableUnits();
      await this.getBuildingUpgradesInfo();
      await this.getUnitStats();
    }
    if (!this.nexusBase || (this.nexusBase.coordsX == 0 && this.nexusBase.coordsY == 0))
    {
      this.isUserComponentOpen = false;
      this.isUserNew = true;
    }

    if (!skipMap || !this.mapData) {
      const mapRes = await this.nexusService.getMap(this.parentRef.user);
      if (mapRes) {
        this.mapData = mapRes;
        this.mapComponent.setMapData(this.mapData);
      }
    }
    this.startGoldIncrement();
  }

  private setAvailableUnits() {
    if (!this.nexusAvailableUnits || !this.nexusBase) return
    if (this.nexusAttacksSent && this.nexusAttacksSent.length > 0) {
      this.nexusAttacksSent.forEach(x => {
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
    if (!this.units || force) {
      const res = await this.nexusService.getUnitStats(this.parentRef.user, this.nexusBase);
      if (res) {
        this.units = res as UnitStats[];
        this.glitcherStats = this.units.find(x => x.unitType == "glitcher") ?? new UnitStats();
        this.assignPicturesToUnitStats();
      }
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
    if (this.nexusUnitsPurchaseList && this.nexusUnitsPurchaseList.length > 0) {
      let count = 0;
      this.factoryUnitsBeingBuilt = 0;
      this.starportUnitsBeingBuilt = 0;
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




  private updateAttackTimers() {
    this.attackTimers = {};

    if (this.nexusAttacksSent && this.nexusAttacksSent.length > 0 && this.nexusBase) {
      let count = 0;
      const uniqueAttacks = new Set<number>(); // Set to keep track of unique attacks
      this.nexusAttacksSent.forEach(x => {
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
            console.log("added attack timer: " + salt + " -> " + remainingTimeInSeconds);
          }
        } 
      });

      console.log('updated attack timers ' + Object.keys(this.attackTimers).length); 
    } 
    this.updateDefenceTimers(); 
  }

  private updateDefenceTimers() {
    if (this.nexusAttacksIncoming && this.nexusAttacksIncoming.length > 0) {
      let count = 0;
      const uniqueDefenses = new Set<string>(); // Set to keep track of unique defenses

      this.nexusAttacksIncoming.forEach(x => {
        const startTimeTime = new Date(x.timestamp).getTime();
        const utcNow = new Date().getTime();
        const elapsedTimeInSeconds = Math.floor((utcNow - startTimeTime)) / 1000;
        const remainingTimeInSeconds = x.duration - elapsedTimeInSeconds;
        count++;
        const returningToBase = (x.originCoordsX == this.nexusBase?.coordsX && x.originCoordsY == this.nexusBase.coordsY);
        const salt = returningToBase ? `{${x.originCoordsX},${x.originCoordsY}} ${count}. Returning {${x.destinationCoordsX},${x.destinationCoordsY}}` : `{${x.originCoordsX},${x.originCoordsY}} ${count}. Incoming {${x.destinationCoordsX},${x.destinationCoordsY}}`;

        if (remainingTimeInSeconds > 0) {
          if (!uniqueDefenses.has(salt)) {
            uniqueDefenses.add(salt);
            this.startAttackTimer(salt, remainingTimeInSeconds);
            console.log("added defence timer: " + salt + " -> " + remainingTimeInSeconds); 
          }
        }
      });
      console.log('updated defence timers ' + Object.keys(this.attackTimers).length); 
    }
  }

   

  debounceLoadNexusData = this.debounce(async () => {
    await this.loadNexusData();
  }, 1000);

  private startUpgradeTimer(upgrade: string, time: number, isUnit: boolean) {
    if (this.buildingTimers[upgrade] || this.unitTimers[upgrade] || !time || isNaN(time)) {
      return;
    }
    //add one second to give the server time to realise whats been built.
    const endTime = Math.max(0, time) + 1;

    if (isUnit) {
      this.unitTimers[upgrade] = {
        endTime: endTime,
        timeout: setTimeout(async () => {
          this.addNotification(`${upgrade} completed!`);
          delete this.unitTimers[upgrade];
          clearInterval(interval);
          this.debounceLoadNexusData();  
          this.cd.detectChanges();
        }, endTime * 1000)
      };
      const interval = setInterval(async () => {
        if (this.unitTimers[upgrade]) {
          const remainingTime = this.unitTimers[upgrade].endTime - 1;
          this.unitTimers[upgrade].endTime = remainingTime;
        }
        this.cd.detectChanges();
      }, 1000);
    } else {
      this.buildingTimers[upgrade] = {
        endTime: endTime,
        timeout: setTimeout(async () => {
          this.addNotification(`${upgrade} upgrade completed!`);
          delete this.buildingTimers[upgrade];
          clearInterval(interval);
          this.debounceLoadNexusData(); 
          this.cd.detectChanges();
        }, endTime * 1000)
      };
      const interval = setInterval(async () => {
        if (this.buildingTimers[upgrade]) {
          const remainingTime = this.buildingTimers[upgrade].endTime - 1;
          this.buildingTimers[upgrade].endTime = remainingTime;
        }
        this.cd.detectChanges();
      }, 1000);
    }
  }

 
  private startAttackTimer(attack: string, time: number) {
    if (this.attackTimers[attack] || !time || isNaN(time)) {
      return;
    }
     
    //add one second to give the server time to realise whats been built.
    const endTime = Math.max(1, time);

    this.attackTimers[attack] = {
      endTime: endTime,
      timeout: setTimeout(async () => {
        this.addNotification(`${attack} completed!`);
        delete this.attackTimers[attack];
        clearInterval(interval);
        this.debounceLoadNexusData();  
        this.cd.detectChanges();
      }, endTime * 1000)
    };
    const interval = setInterval(async () => {
      if (this.attackTimers[attack]) { 
        this.attackTimers[attack].endTime = this.attackTimers[attack].endTime - 1; // this -1 must be set to decrease timer
      }
      this.cd.detectChanges(); 
    }, 1000); 
  }


  private async getBuildingUpgradesInfo() {
    if (!this.parentRef || !this.parentRef.user || !this.nexusBase) return; 

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
    } else {
      this.reinitializeBuildingTimers();
    }
  }

  private primeTheTimerForBuildingUgrades(startTime: Date, type: string) {
    if (!this.nexusAvailableUpgrades) return;
    const startTimeTime = new Date(startTime).getTime();
    const duration = this.nexusAvailableUpgrades.find(u => u.building === type)?.duration || 0;
    const utcNow = new Date().getTime();
    const elapsedTimeInSeconds = Math.floor((utcNow - startTimeTime)) / 1000;
    const remainingTimeInSeconds = duration - elapsedTimeInSeconds;
    const salt = "{" + this.nexusBase?.coordsX + " " + this.nexusBase?.coordsY + "} ";

    if (remainingTimeInSeconds > 0) {
      this.startUpgradeTimer(salt + type, remainingTimeInSeconds, false);
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
      this.startUpgradeTimer(type, remainingTimeInSeconds, true);
    }
  }

  private async reinitializeBuildingTimers() {
    Object.keys(this.buildingTimers).forEach(building => {
      if (this.buildingTimers[building]) {
        clearTimeout(this.buildingTimers[building].timeout);
        delete this.buildingTimers[building];
      }
    });
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
    if (this.nexusBase && this.getBuildingCountersLength() >= this.nexusBase.commandCenterLevel + 1) {
      return alert("Upgrade your Command Center for more worker slots");
    }
    if (this.getBuildingTimerForBuilding(upgrade.building)) {
      return alert("You must wait until the upgrade finishes");
    }

    const upgradeFunctionMap: { [key: string]: () => Promise<void> } = {
      'mines': () => this.upgrade(this.nexusService.upgradeMines.bind(this.nexusService)),
      'starport': () => this.upgrade(this.nexusService.upgradeStarport.bind(this.nexusService)),
      'factory': () => this.upgrade(this.nexusService.upgradeFactory.bind(this.nexusService)),
      'engineering_bay': () => this.upgrade(this.nexusService.upgradeEngineeringBay.bind(this.nexusService)),
      'warehouse': () => this.upgrade(this.nexusService.upgradeWarehouse.bind(this.nexusService)),
      'supply_depot': () => this.upgrade(this.nexusService.upgradeSupplyDepot.bind(this.nexusService)),
      'command_center': () => this.upgrade(this.nexusService.upgradeCommandCenter.bind(this.nexusService))
    };

    const upgradeFunc = upgradeFunctionMap[upgrade.building];
    if (upgradeFunc) {
      await upgradeFunc();
    }
  }

  async upgrade(upgradeServiceFunc: (user: any, base: any) => Promise<string>): Promise<void> {
    if (!this.parentRef || !this.parentRef.user || !this.nexusBase) { return; }

    const res = await upgradeServiceFunc(this.parentRef.user, this.nexusBase);
    if (res) {
      this.addNotification(`{${this.nexusBase.coordsX},${this.nexusBase.coordsY}} ${res}`);
    }
    await this.loadNexusData(true);
  }

  async purchaseUnit(unitId: number) {
    if (!this.units) return;
    const tmpUnit = this.units.find(x => x.unitId == unitId);
    if (!this.parentRef || !this.parentRef.user || !tmpUnit || !this.nexusBase) return;

    if ((this.factoryUnitIds.includes(unitId)) && this.factoryUnitsBeingBuilt >= this.nexusBase.factoryLevel) {
      return alert("Upgrade the Factory to train more units simultaneously.");
    } else if ((this.starportUnitIds.includes(unitId)) && this.starportUnitsBeingBuilt >= this.nexusBase.starportLevel) {
      return alert("Upgrade the Starport to train more units simultaneously.");
    }

    const res = await this.nexusService.purchaseUnit(this.parentRef.user, this.nexusBase, tmpUnit.unitId, tmpUnit.purchasedValue ?? 0);
    if (res && res != '') {
      this.addNotification(res);
    } else {
      this.addNotification(`Purchased ${tmpUnit.purchasedValue} ${tmpUnit.unitType}`);
      if (this.units) {
        this.units.forEach(x => {
          x.purchasedValue = undefined;
        });
      }
      await this.loadNexusData(true);
    }
  }

  async viewMap(force?: boolean) {
    this.isMapOpen = force != undefined ? force : !this.isMapOpen;
    if (this.isMapOpen) {
      setTimeout(() => { this.mapComponent.scrollToUserBase(); }, 10);
    } 
  }
  startGoldIncrement() {
    if (this.goldIncrementInterval) {
      clearInterval(this.goldIncrementInterval);
    }

    const intervalTime = this.miningSpeed * 1000;

    if (this.miningSpeed != 0) {
      this.goldIncrementInterval = setInterval(() => {
        if (this.goldAmount >= this.goldCapacity) {
          this.goldAmount = this.goldCapacity;
          this.stopGoldIncrement();
          return;
        }
        this.goldAmount += 1;
        this.cd.detectChanges();
      }, intervalTime);
    }
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
    navigator.clipboard.writeText(link);
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
    if (this.nexusAvailableUpgrades && this.nexusAvailableUpgrades) {
      if (!this.nexusBase || !this.nexusBase.minesLevel) { 
        return this.nexusAvailableUpgrades.filter(x => x.building === "mines");
      } else {
        return this.nexusAvailableUpgrades.filter(x => x.cost > 0);
      }
    } else {
      return [];
    }
  }
  maxSliderValue(unit: UnitStats): number {
    const goldTimesUnitGoldMaxCost = Math.floor(this.goldAmount / unit.cost);
    const supplyTimesUnitGoldMaxCost = Math.floor(this.calculateCurrentSupply() / unit.supply);

    const maxGoldValue = Math.min(goldTimesUnitGoldMaxCost, supplyTimesUnitGoldMaxCost);

    return maxGoldValue;
  }
  onSliderChange(event: any, unit: UnitStats): void {
    const value = Math.min(this.maxSliderValue(unit) , event.target.value); 
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
    s = s.replace(/\w+/g,
      function (w) { return w[0].toUpperCase() + w.slice(1).toLowerCase(); });
    return s;
  }
  getBuildingTimerForBuilding(building: string): BuildingTimer {
    const formatted = "{" + this.nexusBase?.coordsX + " " + this.nexusBase?.coordsY + "} " + this.formatBuildingTimer(building).toLowerCase().replace(" ", "_");

    return this.buildingTimers[formatted];
  }

  private loadPictureSrcs() {
    if (!this.commandCenterPictureSrc) {
      this.fileService.getFileSrcByFileId(5920)
        .then(src => {
          this.commandCenterPictureSrc = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }
    if (!this.starportPictureSrc) {
      this.fileService.getFileSrcByFileId(6241)
        .then(src => {
          this.starportPictureSrc = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }
    if (!this.minesPictureSrc) {
      this.fileService.getFileSrcByFileId(5922)
        .then(src => {
          this.minesPictureSrc = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }
    if (!this.factoryPictureSrc) {
      this.fileService.getFileSrcByFileId(5921)
        .then(src => {
          this.factoryPictureSrc = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }
    if (!this.supplyDepotPictureSrc) {
      this.fileService.getFileSrcByFileId(5952)
        .then(src => {
          this.supplyDepotPictureSrc = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }
    if (!this.warehousePictureSrc) {
      this.fileService.getFileSrcByFileId(6110)
        .then(src => {
          this.warehousePictureSrc = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }
    if (!this.engineeringBayPictureSrc) {
      this.fileService.getFileSrcByFileId(6113)
        .then(src => {
          this.engineeringBayPictureSrc = src;
        })
        .catch(error => {
          console.error('Error loading map tile source:', error);
        });
    }

    if (!this.nexusBackgroundPictureSrc) {
      this.fileService.getFileSrcByFileId(5940)
        .then(src => {
          this.nexusBackgroundPictureSrc = src;
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
  emittedReloadEvent(reason: string) {
    console.log("emitted reload event " + reason);
    this.loadNexusData(false);
  }
  emittedNotifications(message: string) {
    if (!message || message.trim() == "") return;
    this.addNotification(message);
  }
  toggleScreen(screen: string, isOpen?: boolean) {
    if (this.isMinesOpen || this.isCommandCenterOpen || this.isSupplyDepotOpen || this.isFactoryOpen || this.isMinesOpen || this.isStarportOpen || this.isWarehouseOpen || this.isEngineeringBayOpen) {
      this.isMinesOpen = false;
      this.isCommandCenterOpen = false;
      this.isStarportOpen = false;
      this.isFactoryOpen = false;
      this.isMinesOpen = false;
      this.isWarehouseOpen = false;
      this.isEngineeringBayOpen = false;
    }
    if (screen == "reports")
    {
      this.isMapOpen = false;
      this.isReportsOpen = isOpen != undefined ? isOpen : !this.isReportsOpen;
    }
    else if (screen == "map")
    {
      this.isReportsOpen = false;
      this.viewMap(isOpen);
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
}
