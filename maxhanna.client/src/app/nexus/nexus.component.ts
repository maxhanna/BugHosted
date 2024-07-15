import { ChangeDetectorRef, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component'; 
import { DirectoryResults } from '../../services/datacontracts/file/directory-results';
import { FileService } from '../../services/file.service';
import { FileEntry } from '../../services/datacontracts/file/file-entry';

@Component({
  selector: 'app-nexus',
  templateUrl: './nexus.component.html',
  styleUrl: './nexus.component.css'
})
export class NexusComponent extends ChildComponent implements OnInit {
  notifications: string[] = [];
  isUserComponentClosed = true;
  isNexusOpen = false;

  nexusPicture: FileEntry | undefined;
  buildingPictureDirectory: DirectoryResults | undefined;

  upgradeMineTimer: any | undefined;
  upgradeFactoryTimer: any | undefined;

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

  constructor(private fileService: FileService, private cd: ChangeDetectorRef) {
    super();
  }

  async ngOnInit() {
    const buildingDirectoryRes = await this.fileService.getDirectory("Nexus/Buildings", "all", "all", this.parentRef?.user, undefined, 1000, undefined, undefined, ["webp"]);
    if (buildingDirectoryRes) {
      this.buildingPictureDirectory = buildingDirectoryRes;
      this.nexusPicture = this.buildingPictureDirectory?.data?.filter(x => x.id == 5920)[0];
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

  upgradeMine() {
    if (!this.upgradeFactoryTimer && this.goldAmount < (this.mineLevel == 0 ? this.mineLevel1Cost : this.mineLevel == 1 ? this.mineLevel2Cost : this.mineLevel3Cost)) {
      return alert("Not enough gold!");
    }
    if (this.upgradeMineTimer) {
      clearTimeout(this.upgradeMineTimer);
      this.upgradeMineTimer = undefined;
      this.cd.detectChanges();
      return;
    }

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

  upgradeFactory() {
    if (!this.upgradeFactoryTimer && this.goldAmount < (this.factoryLevel == 0 ? this.factoryLevel1Cost : this.factoryLevel == 1 ? this.factoryLevel2Cost : this.factoryLevel3Cost)) {
      return alert("Not enough gold!");
    }
    if (this.upgradeFactoryTimer) {
      clearTimeout(this.upgradeFactoryTimer);
      this.upgradeFactoryTimer = undefined;
      this.cd.detectChanges();
      return;
    }

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

  copyLink() { 
    const link = `https://bughosted.com/Nexus`;
    navigator.clipboard.writeText(link);
  }
}
