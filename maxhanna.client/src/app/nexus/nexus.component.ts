import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { FileService } from '../../services/file.service';
import { NexusService } from '../../services/nexus.service';
import { NexusBase } from '../../services/datacontracts/nexus/nexus-base';
import { NexusBaseUpgrades } from '../../services/datacontracts/nexus/nexus-base-upgrades';
import { NexusMapComponent } from '../nexus-map/nexus-map.component';
import { NexusAvailableUpgrades, UpgradeDetail } from '../../services/datacontracts/nexus/nexus-available-upgrades';
import { BuildingTimer } from '../../services/datacontracts/nexus/building-timer';
import { User } from '../../services/datacontracts/user/user';
import { UnitStats } from '../../services/datacontracts/nexus/unit-stats';
import { NexusUnits } from '../../services/datacontracts/nexus/nexus-units';
import { NexusUnitsPurchased } from '../../services/datacontracts/nexus/nexus-units-purchased';

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
   
  mapData?: NexusBase[] = undefined; 
  nexusBase?: NexusBase;
  nexusBaseUpgrades?: NexusBaseUpgrades;
  nexusUnits?: NexusUnits;
  nexusUnitsPurchaseList?: NexusUnitsPurchased[];
  nexusAvailableUpgrades?: NexusAvailableUpgrades;
  units?: UnitStats[];

  buildingTimers: { [key: string]: BuildingTimer } = {};
  unitTimers: { [key: string]: BuildingTimer } = {};
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

  @ViewChild('upgradeMineButton') upgradeMineButton!: ElementRef<HTMLButtonElement>;
  @ViewChild('upgradeFactoryButton') upgradeFactoryButton!: ElementRef<HTMLButtonElement>;
  @ViewChild('mapComponentDiv') mapComponentDiv!: ElementRef<HTMLDivElement>;
  @ViewChild(NexusMapComponent) mapComponent!: NexusMapComponent;

  constructor(private fileService: FileService, private nexusService: NexusService, private cd: ChangeDetectorRef) {
    super();
  }

  async ngOnInit() {
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
      //console.log(this.nexusBase);
      //console.log(this.nexusBaseUpgrades);
      this.currentBaseLocationX = data.nexusBase.coordsX;
      this.currentBaseLocationY = data.nexusBase.coordsY;
      this.goldAmount = data.nexusBase.gold;
      this.goldCapacity = (data.nexusBase.warehouseLevel + 1) * 5000;
      this.supplyCapacity = (data.nexusBase.supplyDepotLevel * 2500);
      this.displayBuildings(this.nexusBaseUpgrades);
      await this.getMinesInfo();
      await this.getBuildingUpgradesInfo();
      await this.getUnitStats();

    } else {
      this.isUserComponentOpen = false;
      this.isUserNew = true;
    }

    if (!skipMap && !this.mapData) {
      const mapRes = await this.nexusService.getMap(this.parentRef.user);
      if (mapRes) {
        this.mapData = mapRes;
        this.mapComponent.setMapData(this.mapData);
      }
    }
    this.startGoldIncrement();
  }

  private async getUnitStats() {
    if (!this.parentRef || !this.parentRef.user || !this.nexusBase) {
      console.log("cant get unit stats, no base present");
      return;
    };
    if (!this.units) {
      const res = await this.nexusService.getUnitStats(this.parentRef.user, this.nexusBase);
      if (res) {
        this.units = res as UnitStats[];
        this.units.filter(x => x.unitType == "marine")[0].pictureSrc = this.marinePictureSrc;
        this.units.filter(x => x.unitType == "goliath")[0].pictureSrc = this.goliathPictureSrc;
        this.units.filter(x => x.unitType == "siege_tank")[0].pictureSrc = this.siegeTankPictureSrc;
        this.units.filter(x => x.unitType == "scout")[0].pictureSrc = this.scoutPictureSrc;
        this.units.filter(x => x.unitType == "wraith")[0].pictureSrc = this.wraithPictureSrc;
        this.units.filter(x => x.unitType == "battlecruiser")[0].pictureSrc = this.battlecruiserPictureSrc;
      }
    }
    this.getUnitTimers();
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
          this.notifications.push(`${upgrade} completed!`);
          delete this.unitTimers[upgrade];
          clearInterval(interval);
          await this.loadNexusData(true);
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
          this.notifications.push(`${upgrade} upgrade completed!`);
          delete this.buildingTimers[upgrade];
          clearInterval(interval);
          await this.loadNexusData(true);
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


  private async getBuildingUpgradesInfo() {
    if (!this.parentRef || !this.parentRef.user || !this.nexusBase) return;
    const upRes = await this.nexusService.getBuildingUpgrades(this.parentRef.user, this.nexusBase);
    if (upRes) {
      this.nexusAvailableUpgrades = upRes;
    }

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
    const duration = this.nexusAvailableUpgrades.upgrades.find(u => u.building === type)?.duration || 0;
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

  private async getMinesInfo() {
    if (!this.parentRef || !this.parentRef.user || !this.nexusBase || this.miningSpeed) return;

    const mineRes = await this.nexusService.getMinesInfo(this.parentRef.user, this.nexusBase);
    if (mineRes) {
      this.miningSpeed = mineRes.speed;
    }
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
      this.notifications.push(`{${this.nexusBase.coordsX},${this.nexusBase.coordsY}} ${res}`);
    }
    await this.loadNexusData(true);
  }

  async purchaseUnit(unitId: number) {
    if (!this.units) return;
    const tmpUnit = this.units.filter(x => x.unitId == unitId)[0];
    if (!this.parentRef || !this.parentRef.user || !tmpUnit || !this.nexusBase) return;

    if ((this.factoryUnitIds.includes(unitId)) && this.factoryUnitsBeingBuilt >= this.nexusBase.factoryLevel) {
      return alert("Upgrade the Factory to train more units simultaneously.");
    } else if ((this.starportUnitIds.includes(unitId)) && this.starportUnitsBeingBuilt >= this.nexusBase.starportLevel) {
      return alert("Upgrade the Starport to train more units simultaneously.");
    }

    const res = await this.nexusService.purchaseUnit(this.parentRef.user, this.nexusBase, tmpUnit.unitId, tmpUnit.purchasedValue ?? 0);
    if (res && res != '') {
      this.notifications.push(res);
    } else {
      this.notifications.push(`Purchased ${tmpUnit.purchasedValue} ${tmpUnit.unitType}`);
      if (this.units) {
        this.units.forEach(x => {
          x.purchasedValue = undefined;
        });
      }
      await this.loadNexusData(true);
    }
  }

  async viewMap() {
    this.isMapOpen = !this.isMapOpen;
    if (this.isMapOpen) {
      this.mapComponentDiv.nativeElement.classList.add("opened");
      this.mapComponent.scrollToUserBase();
    } else {
      this.mapComponentDiv.nativeElement.classList.remove("opened");
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
    if (this.nexusAvailableUpgrades && (!this.nexusBase || !this.nexusBase.minesLevel)) {
      return this.nexusAvailableUpgrades.upgrades.filter(x => x.building == "mines");
    }
    else if (this.nexusAvailableUpgrades) {
      return this.nexusAvailableUpgrades.upgrades.filter(x => x.cost > 0);
    }
    else return;
  }
  maxSliderValue(unit: UnitStats): number {
    const goldTimesUnitGoldMaxCost = Math.floor(this.goldAmount / unit.cost);
    const supplyTimesUnitGoldMaxCost = Math.floor(this.calculateCurrentSupply() / unit.supply);

    const maxGoldValue = Math.min(goldTimesUnitGoldMaxCost, supplyTimesUnitGoldMaxCost);

    return maxGoldValue;
  }
  onSliderChange(event: any, unit: UnitStats): void {
    unit.purchasedValue = parseInt(event.target.value);
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
  getSupplyUsedPerUnit(unitId: number) {
    return this.getSupplyUsed().filter(x => x.unitId == unitId)[0].supplyUsed;
  }
  getSupplyUsed() {
    // Create a mapping of unit types to their respective total counts
    const unitTypeTotals = {
      "marine": this.nexusUnits?.marineTotal ?? 0,
      "goliath": this.nexusUnits?.goliathTotal ?? 0,
      "siege_tank": this.nexusUnits?.siegeTankTotal ?? 0,
      "wraith": this.nexusUnits?.wraithTotal ?? 0,
      "battlecruiser": this.nexusUnits?.battlecruiserTotal ?? 0
    };

    // Create a new array to store the supply used for each unit type
    const supplyUsedPerUnit = this.units?.map(unit => {
      const unitType = unit.unitType as keyof typeof unitTypeTotals;
      const unitTotalCount = unitTypeTotals[unitType] || 0;
      const supplyUsed = unit.supply * unitTotalCount;
      return {
        unitId: unit.unitId,
        unitType: unit.unitType,
        supplyUsed: supplyUsed
      };
    }) || [];

    return supplyUsedPerUnit;
  }
  filterUnitsForSupplyDisplay() {
    if (!this.units) return [];
    return this.units.filter(x => this.getSupplyUsedPerUnit(x.unitId) > 0)
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
      this.fileService.getFileSrcByFileId(6254)
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
  }

}
