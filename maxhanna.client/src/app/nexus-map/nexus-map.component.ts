import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { NexusBase } from '../../services/datacontracts/nexus/nexus-base';
import { User } from '../../services/datacontracts/user/user';
import { AppComponent } from '../app.component';
import { NexusUnits } from '../../services/datacontracts/nexus/nexus-units';
import { UnitStats } from '../../services/datacontracts/nexus/unit-stats';
import { NexusAttackSent } from '../../services/datacontracts/nexus/nexus-attack-sent';
import { NexusReportsComponent } from '../nexus-reports/nexus-reports.component';
import { NexusService } from '../../services/nexus.service';
import { AttackTimer } from '../../services/datacontracts/nexus/attack-timer';
import { AttackEventPayload } from '../../services/datacontracts/nexus/attack-event-payload';


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
  isSendingDefence = false;
  randomRotations: number[][] = [];
  randomMap: number[][] = [];

  @Input() user?: User;
  @Input() nexusAvailableUnits?: NexusUnits;
  @Input() nexusUnitsOutsideOfBase?: NexusUnits;
  @Input() nexusBase?: NexusBase;
  @Input() lvl1Src?: string;
  @Input() lvl2Src?: string;
  @Input() lvl3Src?: string;
  @Input() mapTileSrc?: string;
  @Input() mapTileSrc2?: string;
  @Input() mapTileSrc3?: string; 
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
  @Input() nexusDefencesSent?: NexusAttackSent[];
  @Input() nexusAttacksIncoming?: NexusAttackSent[];
  @Input() nexusDefencesIncoming?: NexusAttackSent[];
  @Input() attackTimers: { [key: string]: AttackTimer; } = {};
  @Input() defenceTimers: { [key: string]: AttackTimer; } = {};
  @Output() emittedReloadEvent = new EventEmitter<string>();
  @Output() closeMapEvent = new EventEmitter<void>();
  @Output() emittedNotifications = new EventEmitter<string>();
  @Output() emittedGoToBaseEvent = new EventEmitter<NexusBase>();
  @Output() emittedAttackEvent = new EventEmitter<AttackEventPayload>();

  @ViewChild('mapInputX') mapInputX!: ElementRef<HTMLInputElement>;
  @ViewChild('mapInputY') mapInputY!: ElementRef<HTMLInputElement>;
  @ViewChild('mapContainer') mapContainer!: ElementRef;
  @ViewChild(NexusReportsComponent) nexusReports!: NexusReportsComponent;


  constructor(private nexusService: NexusService) { }

  scrollToCoordinates(coordsX: number, coordsY: number, hideAttackButton?: boolean) {
    if (!this.user || !this.mapData || this.mapData.length === 0) return;
    const cell = this.mapContainer.nativeElement.querySelector(`.cell[x='${coordsX}'][y='${coordsY}']`);
    if (cell) {
      cell.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
    if (hideAttackButton) {
      this.selectedNexusBase = undefined;
    }
  }

  getSrcForBase(baseLvl: string) {
    const num = parseInt(baseLvl);
    if (num) {
      return num >= 35 ? this.lvl3Src : num > 20 ? this.lvl2Src : this.lvl1Src;
    }
    return;
  }

  setMapData(nexusBases: NexusBase[]) {
    this.mapData = nexusBases;

    for (let i = 0; i < 100; i++) {
      this.grid[i] = [];
      for (let j = 0; j < 100; j++) {
        let base = this.mapData.find(x => x.coordsX == i && x.coordsY == j);
        if (base) {
          this.grid[i][j] = base.commandCenterLevel + base.minesLevel + base.warehouseLevel + base.factoryLevel + base.starportLevel + base.engineeringBayLevel
            + base.marineLevel + base.goliathLevel + base.siegeTankLevel + base.scoutLevel + base.wraithLevel + base.battlecruiserLevel + base.glitcherLevel + '';
        } else {
          this.grid[i][j] = "";
        }
      }
    }
    this.generateRandomRotations(); 
    this.randomMap = this.generateRandomMap(100, 100);
  }
  generateRandomRotations() {
    const possibleRotations = [0, 180, 270];
    for (let y = 0; y < this.grid.length; y++) {
      this.randomRotations[y] = [];
      for (let x = 0; x < this.grid[y].length; x++) { 
        const randomIndex = Math.floor(Math.random() * possibleRotations.length);
        this.randomRotations[y][x] = possibleRotations[randomIndex];
      }
    }
  }
   

  showAttackScreen(isDefence: boolean) {
    console.log("show attack screen");
    console.log(this.selectedNexusBase);
    console.log(this.nexusBase);
    if (this.selectedNexusBase && this.nexusBase && this.selectedNexusBase.coordsX == this.nexusBase.coordsX && this.selectedNexusBase.coordsY == this.nexusBase.coordsY) { return alert("Cannot attack or defend the same base."); }
    if (this.unitStats) {
      this.unitStats.sort((a, b) => a.cost - b.cost);
    }
    this.isAttackScreenOpen = true;
    this.showAttackButton = false; 
    this.isSendingDefence = isDefence; 
  }

  closedAttackScreen() {
    this.showAttackButton = true;
    this.isAttackScreenOpen = false;
  }

  emittedAttack(attack: NexusAttackSent) {
    this.emittedAttackEvent.emit({ attack: attack, isSendingDefence: this.isSendingDefence } as AttackEventPayload); 
    console.log(this.nexusDefencesSent?.filter(x => x.arrived == false)); 
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
  hash(x: number, y: number): number {
    const seed = (x * 73856093) ^ (y * 19349663);
    const lcg = (seed * 1664525 + 1013904223) & 0xffffffff;
    return (lcg % 3) + 1; // Returns 1, 2, or 3
  }
  getRandomEmptyMapTile(x: number, y: number) {
    const tileType = this.randomMap[y][x];
    if (tileType === 1) {
      return this.mapTileSrc;
    } else if (tileType === 2) {
      return this.mapTileSrc2;
    } else {
      return this.mapTileSrc3;
    }
  }
  generateRandomMap(gridSizeX: number, gridSizeY: number): number[][] {
    const randomMap: number[][] = [];
    for (let y = 0; y < gridSizeY; y++) {
      const row: number[] = [];
      for (let x = 0; x < gridSizeX; x++) {
        row.push(this.hash(x, y)); // Generate consistent "random" number for each cell
      }
      randomMap.push(row);
    }
    return randomMap;
  }
  selectCoordinates(coordsx: number, coordsy: number) {
    this.selectedNexusBase = undefined;
    this.showAttackButton = true;
    this.isReportsHidden = true;
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
        warehouseLevel: 0,
        marineLevel: 0,
        goliathLevel: 0,
        siegeTankLevel: 0,
        scoutLevel: 0,
        wraithLevel: 0,
        battlecruiserLevel: 0,
        glitcherLevel: 0,
      };
    }
    setTimeout(() => {
      if (this.nexusReports && !this.isReportsHidden) {
        this.nexusReports.loadBattleReports(this.selectedNexusBase);
      }
    }, 10);
     
  }
  getAttackTimersForCoords(coordsX: number, coordsY: number): AttackTimer[] {
    const targetBase = `{${coordsX},${coordsY}}`;
    //console.log("get attack timers for " + targetBase);
    //console.log(this.attackTimers);
    return Object.entries(this.attackTimers)
      .filter(([key, value]) => key.split(".")[1] && key.split(".")[1].includes(targetBase))
      .map(([key, value]) => value);
  }
  getDefenceTimersForCoords(coordsX: number, coordsY: number): AttackTimer[] {
    const targetBase = `{${coordsX},${coordsY}}`;
    //console.log("get defence timers for " + targetBase);
    //console.log(this.defenceTimers);
    return Object.entries(this.defenceTimers)
      .filter(([key, value]) => key.split(".")[1] && key.split(".")[1].includes(targetBase))
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
  getBaseAllianceSpanClass(x: number, y: number) {
    const targetBase = this.mapData.find(target => target.coordsX == x && target.coordsY == y);
    if (targetBase && targetBase.user && this.user) {
      if (targetBase.user.id == this.user.id) {
        return "myBase";
      } else {
        return "enemyBase";
      }
    }
    return "emptyBase";
  }
  isAttackSentOn(x: number, y: number) {
    if (!this.nexusAttacksSent && !this.nexusDefencesSent) return false; 
    if (this.nexusAttacksSent) {
      const relevantAttack = this.nexusAttacksSent.find(nb => nb.destinationCoordsX == x && nb.destinationCoordsY == y);
      if (relevantAttack) return true;
    }
    
    if (this.nexusAttacksIncoming) { 
      return this.nexusAttacksIncoming.some(nb => nb.destinationCoordsX == x && nb.destinationCoordsY == y && nb.originUser?.id != this.user?.id); 
    }

    return false;
  }
  isAttackReturningOn(x: number, y: number) {
    if (!this.nexusAttacksSent) return false;

    const currentBases = this.mapData.filter(base => base.user?.id == this.user?.id);

    let relevantAttack = undefined;
    if (this.nexusAttacksSent) {
      relevantAttack = this.nexusAttacksSent.find(
        nb => nb.destinationCoordsX == x && nb.destinationCoordsY == y
          && currentBases.find(
            cb => cb.coordsX == nb.originCoordsX
              && cb.coordsY == nb.originCoordsY
              && cb.coordsX == nb.destinationCoordsX
              && cb.coordsY == nb.destinationCoordsY
          ) 
      ) as NexusAttackSent;
    }
    return relevantAttack;
  }
  isDefenceSentOn(x: number, y: number) {
    if (!this.nexusDefencesSent || this.nexusDefencesSent.length == 0) return false; 
    let relevantDefence = undefined; 
    relevantDefence = this.nexusDefencesSent.find(
      nb => nb.destinationCoordsX == x && nb.destinationCoordsY == y && nb.arrived == false
    ) as NexusAttackSent; 
    return relevantDefence;
  }
}
