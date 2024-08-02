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
  @Input() nexusAvailableUnits?: NexusUnits;
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
  @Input() attackTimers: { [key: string]: AttackTimer; } = {};
  @Output() emittedReloadEvent = new EventEmitter<string>();
  @Output() closeMapEvent = new EventEmitter<void>();
  @Output() emittedNotifications = new EventEmitter<string>();
  @Output() emittedGoToBaseEvent = new EventEmitter<NexusBase>();
  @Output() emittedAttackEvent = new EventEmitter<NexusAttackSent>();

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

  emittedAttack(attack: NexusAttackSent) { 
    this.emittedAttackEvent.emit(attack);
    console.log(this.nexusAttacksSent);
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
  getRandomEmptyMapTile() {
    return this.mapTileSrc;
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
    if (!this.nexusAttacksSent) return false;
    //console.log(this.nexusAttacksSent);
    const relevantAttack = this.nexusAttacksSent.find(nb => nb.destinationCoordsX == x && nb.destinationCoordsY == y);
    if (relevantAttack) return true;
    if (!this.nexusAttacksIncoming) return false;
    const relevantDefence = this.nexusAttacksIncoming.find(nb => nb.destinationCoordsX == x && nb.destinationCoordsY == y);
    if (relevantDefence) return true;

    return false;
  }
  isAttackReturningOn(x: number, y: number) {
    if (!this.nexusAttacksSent) return false;
    const currentBases = this.mapData.filter(base => base.user?.id == this.user?.id);
    const relevantAttack = this.nexusAttacksSent.find(
      nb => nb.destinationCoordsX == x && nb.destinationCoordsY == y
        && currentBases.find(
          cb => cb.coordsX == nb.originCoordsX
            && cb.coordsY == nb.originCoordsY
            && cb.coordsX == nb.destinationCoordsX
            && cb.coordsY == nb.destinationCoordsY
        )
    );

    return relevantAttack;
  }
}
