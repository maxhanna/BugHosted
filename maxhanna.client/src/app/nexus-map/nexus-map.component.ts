import { Component, ElementRef, EventEmitter, Input, Output, Renderer2, ViewChild } from '@angular/core';
import { NexusBase } from '../../services/datacontracts/nexus/nexus-base';
import { User } from '../../services/datacontracts/user/user'; 
import { AppComponent } from '../app.component';
import { NexusUnits } from '../../services/datacontracts/nexus/nexus-units';
import { UnitStats } from '../../services/datacontracts/nexus/unit-stats';
import { NexusAttackSent } from '../../services/datacontracts/nexus/nexus-attack-sent';
import { NexusReportsComponent } from '../nexus-reports/nexus-reports.component';
import { BuildingTimer } from '../../services/datacontracts/nexus/building-timer';
import { NexusService } from '../../services/nexus.service';

@Component({
  selector: 'app-nexus-map',
  templateUrl: './nexus-map.component.html',
  styleUrl: './nexus-map.component.css'
})
export class NexusMapComponent {
  mapData: NexusBase[] = [];
  selectedNexusBase?: NexusBase;
  grid: string[][] = []; 
  isAttackScreenOpen = false;
  showAttackButton = false;
  isReportsHidden = true;

  @Input() user?: User;
  @Input() nexusUnits?: NexusUnits;
  @Input() nexusBase?: NexusBase;
  @Input() nexusPictureSrc?: string;
  @Input() mapTileSrc?: string;
  @Input() marinePictureSrc: string | undefined;
  @Input() goliathPictureSrc: string | undefined;
  @Input() siegeTankPictureSrc: string | undefined;
  @Input() scoutPictureSrc: string | undefined;
  @Input() wraithPictureSrc: string | undefined;
  @Input() battlecruiserPictureSrc: string | undefined;
  @Input() glitcherPictureSrc: string | undefined;
  @Input() unitStats?: UnitStats[];
  @Input() inputtedParentRef?: AppComponent; 
  @Input() nexusAttacksSent?: NexusAttackSent[];
  @Input() nexusAttacksIncoming?: NexusAttackSent[];
  @Input() attackTimers: { [key: string]: BuildingTimer } = {}; 
  @Output() emittedReloadEvent = new EventEmitter<string>();
  @Output() closeMapEvent = new EventEmitter<void>();
  @Output() emittedNotifications = new EventEmitter<string>();

  @ViewChild('mapInputX') mapInputX!: ElementRef<HTMLInputElement>;
  @ViewChild('mapInputY') mapInputY!: ElementRef<HTMLInputElement>;
  @ViewChild('mapContainer') mapContainer!: ElementRef;
  @ViewChild(NexusReportsComponent) nexusReports!: NexusReportsComponent; 
   
   
  constructor(private nexusService: NexusService) {  } 

  scrollToUserBase() {
    const userId = this.user?.id;
    const userBase = this.mapData.find(b => b.user?.id === userId);
    if (userBase) {
      this.scrollToCoordinates(userBase.coordsX, userBase.coordsY);
    }
    this.selectedNexusBase = undefined;
  }

  scrollToCoordinates(coordsX: number, coordsY: number) {
    if (!this.user || !this.mapData || this.mapData.length === 0) return;

    const cell = this.mapContainer.nativeElement.querySelector(`.cell[x='${coordsX}'][y='${coordsY}']`);
    if (cell) {
      cell.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
    this.selectedNexusBase = undefined;
  }

  setMapData(nexusBases: NexusBase[]) { 
    this.mapData = nexusBases; 
     
    for (let i = 0; i < 100; i++) {
      this.grid[i] = [];
      for (let j = 0; j < 100; j++) {
        let base = this.mapData.find(x => x.coordsX == i && x.coordsY == j);
        if (base) {
          this.grid[i][j] = base.commandCenterLevel + '';  
        } else {
          this.grid[i][j] = "";
        }

        if (this.nexusAttacksIncoming && this.nexusAttacksIncoming.some(x => x.destinationCoordsX == i && x.destinationCoordsY == j)) {
          setTimeout(() => {
            if (document.getElementById("x" + i + ",y" + j + "LocCoordsDiv")) {
              document.getElementById("x" + i + ",y" + j + "LocCoordsDiv")!.innerText = ("⚔️");
            }
          }, 10);
        } else if (this.nexusAttacksSent && this.nexusAttacksSent.some(x => x.destinationCoordsX == i && x.destinationCoordsY == j)) {
          setTimeout(() => {
            if (document.getElementById("x" + i + ",y" + j + "LocCoordsDiv")) {
              document.getElementById("x" + i + ",y" + j + "LocCoordsDiv")!.innerText = ("⚔️");
            }
          }, 10);
        }  
      }
    } 
  }

  showAttackScreen() {
    if (this.unitStats) {
      this.unitStats.sort((a, b) => a.cost - b.cost);
    }
    this.isAttackScreenOpen = true;
    this.showAttackButton = false;
  }

  closedAttackScreen() {
    this.showAttackButton = true;
    this.isAttackScreenOpen = false;
  }

  emittedAttackCoordinates(nexus: NexusBase) {
    console.log("x" + nexus.coordsX + ",y" + nexus.coordsY + "LocDiv");
    if (document.getElementById("x" + nexus.coordsX + ",y" + nexus.coordsY + "LocCoordsDiv")) {
      document.getElementById("x" + nexus.coordsX + ",y" + nexus.coordsY + "LocCoordsDiv")!.innerText += ("⚔️");  
    }
  }

  clearMapInputs() {
    this.mapInputX.nativeElement.value = '';
    this.mapInputY.nativeElement.value = ''; 
  }
  showMapLocation() {
    const x = parseInt(this.mapInputX.nativeElement.value);
    const y = parseInt(this.mapInputY.nativeElement.value);
    if (x < 0 || y < 0) { return alert("Invalid Coordinates."); }
    if (x > this.grid[0].length) {
      return alert("X coordinates off map.");
    } else if (y > this.grid[0].length) { 
      return alert("Y coordinates off map.");
    }
    this.scrollToCoordinates(x, y);
  }
  showHomeBase() {
    this.scrollToUserBase();
  }
  getRandomEmptyMapTile() {
    return this.mapTileSrc;
  }
  selectCoordinates(coordsx: number, coordsy: number) {
    this.selectedNexusBase = undefined;
    this.showAttackButton = true;
    this.isAttackScreenOpen = false;
    this.unitStats?.forEach(x => x.sentValue = undefined);
    this.selectedNexusBase = this.mapData.find(x => x.coordsX && x.coordsY && x.coordsX == coordsx && x.coordsY == coordsy);
    if (!this.selectedNexusBase) {
      this.selectedNexusBase = {
        coordsX: coordsx,
        coordsY: coordsy,
        gold: 0,
        supply: 0,
        supplyDepotLevel: 0,
        commandCenterLevel: 0,
        minesLevel: 0,
        engineeringBayLevel: 0,
        factoryLevel: 0,
        starportLevel: 0,
        warehouseLevel: 0
      };
    }
    setTimeout(() => {
      if (this.nexusReports && !this.isReportsHidden) {
        this.nexusReports.loadBattleReports(this.selectedNexusBase);
      }
    }, 10); 
  } 
  getAttackTimersForCoords(coordsX: number, coordsY: number): BuildingTimer[] {
    const targetBase = `{${coordsX},${coordsY}}`;  
    return Object.entries(this.attackTimers)
      .filter(([key, value]) => key.split(".")[1].includes(targetBase))
      .map(([key, value]) => value);
  }

  formatTimer(allSeconds?: number): string {
    return this.nexusService.formatTimer(allSeconds);
  }

  getRemainingTime(endTime: number): string {
    const now = Date.now();
    const remainingTime = endTime - now;

    if (remainingTime <= 0) {
      return 'Time is up!';
    }

    const hours = Math.floor(remainingTime / (1000 * 60 * 60));
    const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((remainingTime % (1000 * 60)) / 1000);

    return `${hours}h ${minutes}m ${seconds}s`;
  }
  toggleShowReports() {
    this.isReportsHidden = !this.isReportsHidden;
    if (!this.isReportsHidden && this.selectedNexusBase) {
      this.nexusReports.loadBattleReports(this.selectedNexusBase);
    }
  }
}
