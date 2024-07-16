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

@Component({
  selector: 'app-nexus',
  templateUrl: './nexus.component.html',
  styleUrl: './nexus.component.css'
})
export class NexusComponent extends ChildComponent implements OnInit, OnDestroy {
  notifications: string[] = [];
  isUserComponentClosed = true;
  isCommandCenterOpen = false;
  isMinesOpen = false;
  isFactoryOpen = false;
  isStarportOpen = false;
  isSupplyDepotOpen = false;
  isMapOpen = false;
  isUserNew = false;
  displayMines = false;
  displayFactory = false;
  displayStarport = false;
  displaySupplyDepot = false;

  commandCenterPicture: FileEntry | undefined;
  starportPicture: FileEntry | undefined;
  supplyDepotPicture: FileEntry | undefined;
  minesPicture: FileEntry | undefined;
  factoryPicture: FileEntry | undefined;
  nexusBackgroundPicture: FileEntry | undefined;
  pictureDirectory: DirectoryResults | undefined;
  mapData?: NexusBase[] = undefined;

  nexusBase!: NexusBase;
  nexusBaseUpgrades!: NexusBaseUpgrades;
  nexusAvailableUpgrades!: NexusAvailableUpgrades;

  upgradeMineTimer: any | undefined;
  upgradeSupplyDepotTimer: any | undefined;
  upgradeStarportTimer: any | undefined;
  upgradeNexusTimer: any | undefined;
  upgradeFactoryTimer: any | undefined;
  buildingTimers: { [key: string]: any } = {
    'Mine': 'upgradeMineTimer',
    'Supply Depot': 'upgradeSupplyDepotTimer',
    'Starport': 'upgradeStarportTimer',
    'Nexus': 'upgradeNexusTimer',
    'Factory': 'upgradeFactoryTimer'
  };

  currentBaseLocationX = 0;
  currentBaseLocationY = 0;
  goldAmount = 200;
  nexusLevel = 0;
  supplyDepotLevel = 0;
  starportLevel = 0;
  factoryLevel = 0;
  miningSpeed = 0;

  goldIncrementInterval: any; 
   
  @ViewChild('upgradeMineButton') upgradeMineButton!: ElementRef<HTMLButtonElement>;
  @ViewChild('upgradeFactoryButton') upgradeFactoryButton!: ElementRef<HTMLButtonElement>;
  @ViewChild('mapComponentDiv') mapComponentDiv!: ElementRef<HTMLDivElement>;
  @ViewChild(NexusMapComponent) mapComponent!: NexusMapComponent;

  constructor(private fileService: FileService, private nexusService: NexusService, private cd: ChangeDetectorRef) {
    super();
  }

  async ngOnInit() {
    await this.loadNexusData();

    const picDirectoryRes = await this.fileService.getDirectory("Nexus/Assets", "all", "all", this.parentRef?.user, undefined, 1000, undefined, undefined, ["webp"]);
    if (picDirectoryRes) {
      this.pictureDirectory = picDirectoryRes;
      //console.log(this.pictureDirectory);
      this.nexusBackgroundPicture = this.pictureDirectory?.data?.filter(x => x.id == 5940)[0];
      this.commandCenterPicture = this.pictureDirectory?.data?.filter(x => x.id == 5920)[0];
      this.starportPicture = this.pictureDirectory?.data?.filter(x => x.id == 5924)[0];
      this.minesPicture = this.pictureDirectory?.data?.filter(x => x.id == 5922)[0];
      this.factoryPicture = this.pictureDirectory?.data?.filter(x => x.id == 5921)[0];
      this.supplyDepotPicture = this.pictureDirectory?.data?.filter(x => x.id == 5952)[0];
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
  closeUserComponent() {
    this.isUserComponentClosed = true;
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
  }

  openStarport() {
    this.isStarportOpen = true;
  }
  closeStarport() {
    this.isStarportOpen = false;
  }
  openSupplyDepot() {
    this.isSupplyDepotOpen = true;
  }
  closeSupplyDepot() {
    this.isSupplyDepotOpen = false;
  }

  async loadNexusData(skipMap: Boolean = false) {
    if (!this.parentRef || !this.parentRef.user) { return; }
    const data = await this.nexusService.getNexus(this.parentRef.user);

    if (data && data.nexusBase && data.nexusBase.userId != 0) {
      this.nexusBase = data.nexusBase;
      this.nexusBaseUpgrades = data.nexusBaseUpgrades;
      this.currentBaseLocationX = data.nexusBase.coordsX;
      this.currentBaseLocationY = data.nexusBase.coordsY;
      this.goldAmount = data.nexusBase.gold;

      this.displayBuildings(this.nexusBaseUpgrades);
      await this.getMinesInfo();
      await this.getBuildingUpgradesInfo();

    } else {
      this.isUserComponentClosed = false;
      this.isUserNew = true;
    }

    if (!skipMap) { 
      const mapRes = await this.nexusService.getMap(this.parentRef.user);
      if (mapRes) {
        this.mapData = mapRes;
        this.mapComponent.setMapData(this.mapData);
      }
    }
  }

  private async getBuildingUpgradesInfo() {
    if (!this.parentRef || !this.parentRef.user || !this.nexusBase) return;
    const upRes = await this.nexusService.getBuildingUpgrades(this.parentRef.user, this.nexusBase);
    if (upRes) { 
      this.nexusAvailableUpgrades = upRes;  
    }
  }

  private async getMinesInfo() {
    if (!this.parentRef || !this.parentRef.user || !this.nexusBase) return;

    const mineRes = await this.nexusService.getMinesInfo(this.parentRef.user, this.nexusBase);
    if (mineRes) {
      this.miningSpeed = mineRes.speed;
    }
  }

  private displayBuildings(nexusBaseUpgrades: NexusBaseUpgrades) {
    if (nexusBaseUpgrades.minesUpgraded || this.nexusBase.minesLevel > 0) {
      this.displayMines = true;
    } else {
      this.displayMines = false;
    }
    if (nexusBaseUpgrades.factoryUpgraded || this.nexusBase.factoryLevel > 0) {
      this.displayFactory = true;
    } else {
      this.displayFactory = false;
    }
    if (nexusBaseUpgrades.starportUpgraded || this.nexusBase.starportLevel > 0) {
      this.displayStarport = true;
    } else {
      this.displayStarport = false;
    }
    if (nexusBaseUpgrades.supplyDepotUpgraded || this.nexusBase.supplyDepotLevel > 0) {
      this.displaySupplyDepot = true;
    } else {
      this.displaySupplyDepot = false;
    }
  }

  async upgradeBuilding(upgrade: UpgradeDetail) {
    let timerKey = this.buildingTimers[upgrade.building];
    const upgradeTime = this.nexusAvailableUpgrades.upgrades.find(u => u.building === upgrade.building)?.duration! * 1000;

    if (timerKey) {
      // Clear the existing timer if any
      if (timerKey) {
        clearTimeout(timerKey);
      }

      // Set the new timer (example: setting it to 60 seconds)
      timerKey = setTimeout(() => {
        console.log(`${upgrade.building} upgrade completed!`);
        timerKey = undefined;
        this.cd.detectChanges();
      }, upgradeTime);

      this.cd.detectChanges();
    }

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
      case 'supply_depot':
        await this.upgradeSupplyDepot();
        break;
      case 'nexus':
        await this.upgradeNexus();
        break;
    }
  }

  async upgradeNexus(): Promise<void> {
    if (!this.parentRef || !this.parentRef.user) { return; }

    this.notifications.push(await this.nexusService.upgradeNexus(this.parentRef.user, this.nexusBase));
    await this.loadNexusData(true);
  }


  async upgradeMines() {
    if (!this.parentRef || !this.parentRef.user) { return; }
     
    if (this.upgradeMineTimer) {
      clearTimeout(this.upgradeMineTimer);
      this.upgradeMineTimer = undefined;
      this.cd.detectChanges();
      return;
    }

    this.notifications.push(await this.nexusService.upgradeMines(this.parentRef.user, this.nexusBase));
    await this.loadNexusData(true); 
    this.upgradeMineTimer = 10;
    const interval = setInterval(() => {
      if (this.upgradeMineTimer !== undefined && this.upgradeMineTimer > 0) {
        this.upgradeMineTimer--;
        this.cd.detectChanges();
      } else {
        clearInterval(interval);
        this.notifications.push('Mine upgrade completed');
        this.nexusBase.minesLevel++;
      }
    }, 1000); // Update every second
  }

  async upgradeFactory() {
    if (!this.parentRef || !this.parentRef.user) { return; }
     
    if (this.upgradeFactoryTimer) {
      clearTimeout(this.upgradeFactoryTimer);
      this.upgradeFactoryTimer = undefined;
      this.cd.detectChanges();
      return;
    }

    this.notifications.push(await this.nexusService.upgradeFactory(this.parentRef.user, this.nexusBase));
    await this.loadNexusData(true);
    this.upgradeFactoryTimer = 120; // 2 minutes in seconds
    const interval = setInterval(() => {
      if (this.upgradeFactoryTimer !== undefined && this.upgradeFactoryTimer > 0) {
        this.upgradeFactoryTimer--;
        this.cd.detectChanges();
      } else {
        clearInterval(interval);
        this.notifications.push('Factory upgrade completed');
        this.factoryLevel++;
      }
    }, 1000); // Update every second
  }


  async upgradeSupplyDepot(): Promise<void> {
    if (!this.parentRef || !this.parentRef.user) { return; }

    this.notifications.push(await this.nexusService.upgradeSupplyDepot(this.parentRef.user, this.nexusBase));
    await this.loadNexusData(true);
  }

  async upgradeStarport(): Promise<void> {
    if (!this.parentRef || !this.parentRef.user) { return; }

    this.notifications.push(await this.nexusService.upgradeStarport(this.parentRef.user, this.nexusBase));
    await this.loadNexusData(true);
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
    const link = `https://bughosted.com/Nexus`;
    navigator.clipboard.writeText(link);
  }
}
