import { ChangeDetectorRef, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component'; 
import { DirectoryResults } from '../../services/datacontracts/file/directory-results';
import { FileService } from '../../services/file.service';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { NexusService } from '../../services/nexus.service';
import { NexusBase } from '../../services/datacontracts/nexus/nexus-base';
import { NexusBaseUpgrades } from '../../services/datacontracts/nexus/nexus-base-upgrades';

@Component({
  selector: 'app-nexus',
  templateUrl: './nexus.component.html',
  styleUrl: './nexus.component.css'
})
export class NexusComponent extends ChildComponent implements OnInit {
  notifications: string[] = [];
  isUserComponentClosed = true;
  isNexusOpen = false;
  isMapOpen = false;
  isUserNew = false;

  nexusPicture: FileEntry | undefined;
  starportPicture: FileEntry | undefined;
  minesPicture: FileEntry | undefined;
  factoryPicture: FileEntry | undefined;
  nexusBackgroundPicture: FileEntry | undefined;
  pictureDirectory: DirectoryResults | undefined;

  nexusBase!: NexusBase;
  nexusBaseUpgrades!: NexusBaseUpgrades;

  upgradeMineTimer: any | undefined;
  upgradeFactoryTimer: any | undefined;

  currentBaseLocationX = 0;
  currentBaseLocationY = 0;
  goldAmount = 200;
  nexusLevel = 0;
  mineLevel = 0;
  factoryLevel = 0;

  mineLevel1Cost = 150;
  mineLevel2Cost = 300;
  mineLevel3Cost = 600; 
  factoryLevel1Cost = 500;
  factoryLevel2Cost = 700;
  factoryLevel3Cost = 900;

  @ViewChild('upgradeMineButton') upgradeMineButton!: ElementRef<HTMLButtonElement>;
  @ViewChild('upgradeFactoryButton') upgradeFactoryButton!: ElementRef<HTMLButtonElement>;

  constructor(private fileService: FileService, private nexusService: NexusService, private cd: ChangeDetectorRef) {
    super();
  }

  async ngOnInit() {
    this.loadNexusData();

    const picDirectoryRes = await this.fileService.getDirectory("Nexus/Assets", "all", "all", this.parentRef?.user, undefined, 1000, undefined, undefined, ["webp"]);
    if (picDirectoryRes) {
      this.pictureDirectory = picDirectoryRes;
      //console.log(this.pictureDirectory);
      this.nexusBackgroundPicture = this.pictureDirectory?.data?.filter(x => x.id == 5940)[0];
      this.nexusPicture = this.pictureDirectory?.data?.filter(x => x.id == 5920)[0];
      this.starportPicture = this.pictureDirectory?.data?.filter(x => x.id == 5924)[0];
      this.minesPicture = this.pictureDirectory?.data?.filter(x => x.id == 5922)[0];
      this.factoryPicture = this.pictureDirectory?.data?.filter(x => x.id == 5921)[0]; 
    } 
  }

  async start() {
    if (!this.parentRef || !this.parentRef.user) { return alert("You must be logged in to play!"); }
    const startRes = await this.nexusService.start(this.parentRef.user);
    console.log(startRes);
    if (startRes) {
      this.currentBaseLocationX = startRes.x;
      this.currentBaseLocationY = startRes.y;
      this.isUserNew = false;
    }
  }
  closeUserComponent() {
    this.isUserComponentClosed = true;
  }
  openNexus() {
    this.isNexusOpen = true;
  }
  closeNexus() {
    this.isNexusOpen = false;
  }

  async loadNexusData() {
    if (!this.parentRef || !this.parentRef.user) { return; }
    const data = await this.nexusService.getNexus(this.parentRef.user);
    console.log(data);
    if (data && data.nexusBase && data.nexusBase.userId != 0) {
      this.nexusBase = data.nexusBase;
      this.nexusBaseUpgrades = data.nexusBaseUpgrades;
    } else {
      this.isUserComponentClosed = false;
      this.isUserNew = true;
    }
  }

  async upgradeNexus(): Promise<void> {
    if (!this.parentRef || !this.parentRef.user) { return; }

    await this.nexusService.upgradeNexus(this.parentRef.user);
    this.loadNexusData();
  }


  async upgradeMine() {
    if (!this.parentRef || !this.parentRef.user) { return; }

    if (!this.upgradeFactoryTimer && this.goldAmount < (this.mineLevel == 0 ? this.mineLevel1Cost : this.mineLevel == 1 ? this.mineLevel2Cost : this.mineLevel3Cost)) {
      return alert("Not enough gold!");
    }
    if (this.upgradeMineTimer) {
      clearTimeout(this.upgradeMineTimer);
      this.upgradeMineTimer = undefined;
      this.cd.detectChanges();
      return;
    }

    await this.nexusService.upgradeMine(this.parentRef.user); 
    this.notifications.push('Mine upgrade started');
    this.upgradeMineTimer = 10; 
    const interval = setInterval(() => {
      if (this.upgradeMineTimer !== undefined && this.upgradeMineTimer > 0) {
        this.upgradeMineTimer--;
        this.cd.detectChanges();
      } else {
        clearInterval(interval);
        this.notifications.push('Mine upgrade completed');
        this.mineLevel++;
      }
    }, 1000); // Update every second
  }

  async upgradeFactory() {
    if (!this.parentRef || !this.parentRef.user) { return; }

    if (!this.upgradeFactoryTimer && this.goldAmount < (this.factoryLevel == 0 ? this.factoryLevel1Cost : this.factoryLevel == 1 ? this.factoryLevel2Cost : this.factoryLevel3Cost)) {
      return alert("Not enough gold!");
    }
    if (this.upgradeFactoryTimer) {
      clearTimeout(this.upgradeFactoryTimer);
      this.upgradeFactoryTimer = undefined;
      this.cd.detectChanges();
      return;
    }

    await this.nexusService.upgradeFactory(this.parentRef.user);
    this.notifications.push('Factory upgrade started');
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

    await this.nexusService.upgradeSupplyDepot(this.parentRef.user);
    this.loadNexusData();
  } 

  async upgradeStarport(): Promise<void> {
    if (!this.parentRef || !this.parentRef.user) { return; }

    await this.nexusService.upgradeStarport(this.parentRef.user);
    this.loadNexusData();
  }

  async viewMap() {
    this.isMapOpen = true;
  }

  copyLink() { 
    const link = `https://bughosted.com/Nexus`;
    navigator.clipboard.writeText(link);
  }
}
