import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { DirectoryResults } from '../../services/datacontracts/file/directory-results';
import { FileService } from '../../services/file.service';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
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

  commandCenterPicture: FileEntry | undefined;
  starportPicture: FileEntry | undefined;
  supplyDepotPicture: FileEntry | undefined;
  warehousePicture: FileEntry | undefined;
  engineeringBayPicture: FileEntry | undefined;
  minesPicture: FileEntry | undefined;
  factoryPicture: FileEntry | undefined;
  marinePicture: FileEntry | undefined;
  goliathPicture: FileEntry | undefined;
  siegeTankPicture: FileEntry | undefined;
  wraithPicture: FileEntry | undefined;
  battleCruiserPicture: FileEntry | undefined;
  nexusBackgroundPicture: FileEntry | undefined;
  pictureDirectory: DirectoryResults | undefined;
  mapData?: NexusBase[] = undefined;

  nexusBase?: NexusBase;
  nexusBaseUpgrades?: NexusBaseUpgrades;
  nexusUnits?: NexusUnits;
  nexusUnitsPurchaseList?: NexusUnitsPurchased[];
  nexusAvailableUpgrades?: NexusAvailableUpgrades;

  buildingTimers: { [key: string]: BuildingTimer } = {};


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

  units?: UnitStats[];
  purchasedValue = 0;

  marineCost = 5;
  marinesPurchased = 0;
  marinesPurchasedValue = 0;

  goldIncrementInterval: any;
  warehouseUpgradeLevels : number[] = [];

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


    await this.loadNexusData();

    if (!this.pictureDirectory) {
      const picDirectoryRes = await this.fileService.getDirectory("Nexus/Assets", "all", "all", this.parentRef?.user, undefined, 1000, undefined, undefined, ["webp"]);
      if (picDirectoryRes) {
        this.pictureDirectory = picDirectoryRes;
        //console.log(this.pictureDirectory);

        //units
        this.marinePicture = this.pictureDirectory?.data?.filter(x => x.id == 6041)[0];
        if (this.units && this.marinePicture && this.units.filter(x => x.unitType == "marine")[0] && !this.units.filter(x => x.unitType == "marine")[0].picture) {
          this.units.filter(x => x.unitType == "marine")[0].picture = this.marinePicture;
        }
        this.goliathPicture = this.pictureDirectory?.data?.filter(x => x.id == 6106)[0];
        if (this.units && this.goliathPicture && this.units.filter(x => x.unitType == "goliath")[0] && !this.units.filter(x => x.unitType == "goliath")[0].picture) {
          this.units.filter(x => x.unitType == "goliath")[0].picture = this.goliathPicture;
        }

        //buildings
        this.nexusBackgroundPicture = this.pictureDirectory?.data?.filter(x => x.id == 5940)[0];
        this.commandCenterPicture = this.pictureDirectory?.data?.filter(x => x.id == 5920)[0];
        this.starportPicture = this.pictureDirectory?.data?.filter(x => x.id == 5924)[0];
        this.minesPicture = this.pictureDirectory?.data?.filter(x => x.id == 5922)[0];
        this.factoryPicture = this.pictureDirectory?.data?.filter(x => x.id == 5921)[0];
        this.supplyDepotPicture = this.pictureDirectory?.data?.filter(x => x.id == 5952)[0];
        this.warehousePicture = this.pictureDirectory?.data?.filter(x => x.id == 6110)[0];
        this.engineeringBayPicture = this.pictureDirectory?.data?.filter(x => x.id == 6113)[0];
      }
    }
    
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

    if (data && data.nexusBase && data.nexusBase.userId != 0) {
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
    console.log("getting unit stats");
    if (!this.parentRef || !this.parentRef.user || !this.nexusBase) {
      console.log("cant get unit stats, no base present");
      return;
    };
    if (!this.units) {
      const res = await this.nexusService.getUnitStats(this.parentRef.user, this.nexusBase);
      if (res) {
        this.units = res as UnitStats[];
        if (this.marinePicture && this.units.filter(x => x.unitType == "marine")) {
          this.units.filter(x => x.unitType == "marine")[0].picture = this.marinePicture;
        }
        if (this.goliathPicture && this.units.filter(x => x.unitType == "goliath")) {
          this.units.filter(x => x.unitType == "goliath")[0].picture = this.goliathPicture;
        }  
      }
    }
    if (this.nexusUnitsPurchaseList && this.nexusUnitsPurchaseList.length > 0) {
      this.nexusUnitsPurchaseList.forEach(x => {
        const startTime = x.timestamp;
        this.primeTheTimerForUnitPurchases(startTime, x.unitIdPurchased);
      });
    }
  }
  private startUpgradeTimer(building: string, time: number) {
    if (this.buildingTimers[building] || !time || isNaN(time)) {
      return;
    }
    //add one second to give the server time to realise whats been built.
    const endTime = Math.max(0, time) + 1;
     
    this.buildingTimers[building] = {
      endTime: endTime,
      timeout: setTimeout(async () => { 
        this.notifications.push(`${building} upgrade completed!`);
        delete this.buildingTimers[building];
        clearInterval(interval);
        await this.loadNexusData(true);
        this.cd.detectChanges();
      }, endTime * 1000)
    };
     
    const interval = setInterval(async () => {
      if (this.buildingTimers[building]) {
        const remainingTime = this.buildingTimers[building].endTime - 1; 
        this.buildingTimers[building].endTime = remainingTime; 
      }
      this.cd.detectChanges();
    }, 1000);
  }

   
  private async getBuildingUpgradesInfo() {
    if (!this.parentRef || !this.parentRef.user || !this.nexusBase) return;
    if (!this.nexusAvailableUpgrades) { 
      const upRes = await this.nexusService.getBuildingUpgrades(this.parentRef.user, this.nexusBase);
      if (upRes) {
        this.nexusAvailableUpgrades = upRes;
      }
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

    if (remainingTimeInSeconds > 0) {
      this.startUpgradeTimer(type, remainingTimeInSeconds);
    }
  }


  private primeTheTimerForUnitPurchases(startTime: Date, id: number) {
    if (!this.units) return;
    console.log(this.units);
    const startTimeTime = new Date(startTime).getTime();
    const duration = this.units.find(u => u.unitId === id)?.duration || 0;
    const type = this.units.find(u => u.unitId === id)?.unitType || "";
    const utcNow = new Date().getTime();
    const elapsedTimeInSeconds = Math.floor((utcNow - startTimeTime)) / 1000;
    const remainingTimeInSeconds = duration - elapsedTimeInSeconds;
    console.log(`remianing time ${remainingTimeInSeconds} for ${type} with duration ${duration}`);
    if (remainingTimeInSeconds > 0) {
      this.startUpgradeTimer(type, remainingTimeInSeconds);
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
    if (this.buildingTimers[upgrade.building]) {
      return alert("You must wait until the upgrade finishes");
    }
  
    // Perform the upgrade action
    switch (upgrade.building) {
      case 'mines':
        await this.upgradeMines();
        break;
      case 'starport':
        await this.upgradeStarport();
        break;
      case 'factory':
        await this.upgradeFactory();
        break;
      case 'engineering_bay':
        await this.upgradeEngineeringBay();
        break;
      case 'warehouse':
        await this.upgradeWarehouse();
        break;
      case 'supply_depot':
        await this.upgradeSupplyDepot();
        break;
      case 'command_center':
        await this.upgradeCommandCenter();
        break;
      default:
        break;
    }
  }


  async upgradeCommandCenter(): Promise<void> {
    if (!this.parentRef || !this.parentRef.user || !this.nexusBase) { return; }

    const res = await this.nexusService.upgradeCommandCenter(this.parentRef.user, this.nexusBase);
    if (res && res.includes("Upgrading ")) {
      this.notifications.push(res + `{${this.nexusBase.coordsX},${this.nexusBase.coordsY}}`);
    }
    await this.loadNexusData(true);
  }


  async upgradeMines() {
    if (!this.parentRef || !this.parentRef.user || !this.nexusBase) { return; }

    const res = await this.nexusService.upgradeMines(this.parentRef.user, this.nexusBase); 
    if (res && res.includes("Upgrading ")) {
      this.notifications.push(res + `{${this.nexusBase.coordsX},${this.nexusBase.coordsY}}`);
    }
    await this.loadNexusData(true);
  }


  async upgradeEngineeringBay() {
    if (!this.parentRef || !this.parentRef.user || !this.nexusBase) { return; }

    const res = await this.nexusService.upgradeEngineeringBay(this.parentRef.user, this.nexusBase);
    if (res && res.includes("Upgrading ")) {
      this.notifications.push(res + `{${this.nexusBase.coordsX},${this.nexusBase.coordsY}}`);
    }
    await this.loadNexusData(true);
  }


  async upgradeWarehouse() {
    if (!this.parentRef || !this.parentRef.user || !this.nexusBase) { return; }

    const res = await this.nexusService.upgradeWarehouse(this.parentRef.user, this.nexusBase);
    if (res && res.includes("Upgrading ")) {
      this.notifications.push(res + `{${this.nexusBase.coordsX},${this.nexusBase.coordsY}}`);
    }
    await this.loadNexusData(true);
  }

  async upgradeFactory() {
    if (!this.parentRef || !this.parentRef.user || !this.nexusBase) { return; }

    const res = await this.nexusService.upgradeFactory(this.parentRef.user, this.nexusBase);
    if (res && res.includes("Upgrading ")) {
      this.notifications.push(res + `{${this.nexusBase.coordsX},${this.nexusBase.coordsY}}`);
    }
    await this.loadNexusData(true);
  }


  async upgradeSupplyDepot(): Promise<void> {
    if (!this.parentRef || !this.parentRef.user || !this.nexusBase) { return; }

    const res = await this.nexusService.upgradeSupplyDepot(this.parentRef.user, this.nexusBase); 
    if (res && res.includes("Upgrading ")) {
      this.notifications.push(res + `{${this.nexusBase.coordsX},${this.nexusBase.coordsY}}`);
    }
    await this.loadNexusData(true);
  }

  async upgradeStarport(): Promise<void> {
    if (!this.parentRef || !this.parentRef.user || !this.nexusBase) { return; }

    const res = await this.nexusService.upgradeStarport(this.parentRef.user, this.nexusBase); 
    if (res && res.includes("Upgrading ")) {
      this.notifications.push(res + `{${this.nexusBase.coordsX},${this.nexusBase.coordsY}}`);
    }
    await this.loadNexusData(true);
  }

  async purchaseUnit(unitId: number) {
    if (!this.units) return; 
    var tmpUnit = this.units.filter(x => x.unitId == unitId)[0];
    if (!this.parentRef || !this.parentRef.user || !tmpUnit || !this.nexusBase) return;

    const res = await this.nexusService.purchaseUnit(this.parentRef.user, this.nexusBase, tmpUnit.unitId, tmpUnit.purchasedValue ?? 0);
    if (res && res != '') {
      this.notifications.push(res);
    } else {
      this.notifications.push(`Purchased ${tmpUnit.purchasedValue} ${tmpUnit.unitType}`);
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
    if (!allSeconds) return '';
    const totalSeconds = allSeconds;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${Math.ceil(seconds)}`;
  }
  timeredNexusUpgrades(): UpgradeDetail[] {
    if (this.nexusAvailableUpgrades && this.nexusAvailableUpgrades.upgrades && this.nexusAvailableUpgrades.upgrades.length > 0) {
      return this.nexusAvailableUpgrades.upgrades.filter(upgrade => this.buildingTimers[upgrade.building]);
    } else {
      return [];
    }
  }
  activeBuildingTimers(): { building: string; endTime: number }[] {
    const activeTimers: { building: string; endTime: number }[] = [];

    for (const building in this.buildingTimers) {
      const timer = this.buildingTimers[building];
      if (timer.endTime) {
        activeTimers.push({ building: building, endTime: timer.endTime });
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
    const supplyTimesUnitGoldMaxCost = Math.floor(this.supplyCapacity / unit.supply);

    const maxGoldValue = Math.min(goldTimesUnitGoldMaxCost, supplyTimesUnitGoldMaxCost);
    
    return maxGoldValue;
  } 
  onSliderChange(event: any, unit: UnitStats): void {
    unit.purchasedValue = parseInt(event.target.value);
  }
  getFactoryUnits() {
    if (!this.units) return; 

    return this.units.filter(x => x.unitType == "marine" || x.unitType == "goliath").sort((a, b) => a.cost - b.cost);
  }
  getStarportUnits() {
    if (!this.units) return; 

    return this.units.filter(x => x.unitType == "wraith" || x.unitType == "battlecruiser").sort((a, b) => b.cost - a.cost);
  }
}
