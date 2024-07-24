import { AfterViewInit, Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { NexusBase } from '../../services/datacontracts/nexus/nexus-base';
import { User } from '../../services/datacontracts/user/user';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { FileService } from '../../services/file.service';
import { DirectoryResults } from '../../services/datacontracts/file/directory-results';
import { AppComponent } from '../app.component';
import { NexusUnits } from '../../services/datacontracts/nexus/nexus-units';
import { UnitStats } from '../../services/datacontracts/nexus/unit-stats';

@Component({
  selector: 'app-nexus-map',
  templateUrl: './nexus-map.component.html',
  styleUrl: './nexus-map.component.css'
})
export class NexusMapComponent implements OnInit {
  mapData: NexusBase[] = [];
  selectedNexusBase?: NexusBase;
  grid: string[][] = []; 
  isAttackScreenOpen = false;
  showAttackButton = false;
   

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
  @Input() unitStats?: UnitStats[];
  @Input() inputtedParentRef?: AppComponent;

  @ViewChild('mapInputX') mapInputX!: ElementRef<HTMLInputElement>;
  @ViewChild('mapInputY') mapInputY!: ElementRef<HTMLInputElement>;
  @ViewChild('mapContainer') mapContainer!: ElementRef;
   
  constructor() {  }

  ngOnInit() {   
  }
  scrollToUserBase() {
    const userId = this.user?.id;
    const userBase = this.mapData.filter(b => b.user?.id === userId)[0];
    if (userBase) {
      this.scrollToCoordinates(userBase.coordsX, userBase.coordsY);
    }  
  }

  scrollToCoordinates(coordsX: number, coordsY: number) {
    if (!this.user || !this.mapData || this.mapData.length === 0) return;

    const cell = this.mapContainer.nativeElement.querySelector(`.cell[x='${coordsX}'][y='${coordsY}']`);
    if (cell) {
      cell.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
  }

  setMapData(nexusBases: NexusBase[]) { 
    this.mapData = nexusBases; 
     
    for (let i = 0; i < 100; i++) {
      this.grid[i] = [];
      for (let j = 0; j < 100; j++) {
        let base = this.mapData.filter(x => x.coordsX == i && x.coordsY == j)[0];
        if (base) {
          this.grid[i][j] = base.commandCenterLevel + '';
        } else {
          this.grid[i][j] = "";
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
  }
}
