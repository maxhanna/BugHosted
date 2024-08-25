import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { NexusBase } from '../../services/datacontracts/nexus/nexus-base';
import { User } from '../../services/datacontracts/user/user';
import { AppComponent } from '../app.component';
import { NexusUnits } from '../../services/datacontracts/nexus/nexus-units';
import { UnitStats } from '../../services/datacontracts/nexus/unit-stats';
import { NexusAttackSent } from '../../services/datacontracts/nexus/nexus-attack-sent';
import { NexusReportsComponent } from '../nexus-reports/nexus-reports.component';
import { NexusService } from '../../services/nexus.service';
import { AttackEventPayload } from '../../services/datacontracts/nexus/attack-event-payload';
import { ChildComponent } from '../child.component';
import { NexusTimer } from '../../services/datacontracts/nexus/nexus-timer';
import { Subject, debounceTime } from 'rxjs';


@Component({
  selector: 'app-nexus-map',
  templateUrl: './nexus-map.component.html',
  styleUrl: './nexus-map.component.css'
})
export class NexusMapComponent extends ChildComponent {
  mapData: NexusBase[] = [];
  selectedNexusBase?: NexusBase; 
  grid: string[][] = [];
  isAttackScreenOpen = false;
  showAttackButton = false;
  isReportsHidden = true;
  isSendingDefence = false;
  isMapRendered = false;
  randomRotations: number[][] = [];
  randomMap: number[][] = [];
  searchTerm = new Subject<string>();

  attackTimers: { [key: string]: NexusTimer } = {};
  defenceTimers: { [key: string]: NexusTimer } = {};

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
  @Input() numberOfPersonalBases: number | undefined;
  @Input() unitStats?: UnitStats[];
  @Input() inputtedParentRef?: AppComponent;
  @Input() nexusAttacksSent?: NexusAttackSent[];
  @Input() nexusDefencesSent?: NexusAttackSent[];
  @Input() nexusAttacksIncoming?: NexusAttackSent[];
  @Input() nexusDefencesIncoming?: NexusAttackSent[];

  @Output() emittedReloadEvent = new EventEmitter<string>();
  @Output() closeMapEvent = new EventEmitter<void>();
  @Output() emittedNotifications = new EventEmitter<string>();
  @Output() emittedGoToBaseEvent = new EventEmitter<NexusBase>();
  @Output() emittedAttackEvent = new EventEmitter<AttackEventPayload>();

  @ViewChild('mapInputX') mapInputX!: ElementRef<HTMLInputElement>;
  @ViewChild('mapInputY') mapInputY!: ElementRef<HTMLInputElement>;
  @ViewChild('mapContainer') mapContainer!: ElementRef;
  @ViewChild('switchNextBaseCheckbox') switchNextBaseCheckbox!: ElementRef<HTMLInputElement>;
  @ViewChild(NexusReportsComponent) nexusReports!: NexusReportsComponent;


  constructor(private nexusService: NexusService) {
    super();
    this.searchTerm.pipe(debounceTime(300)).subscribe(() => {
      this.showMapLocation();
    });
  }

  zoomOut() {
    const mapElement = document.getElementsByClassName('map')[0] as HTMLDivElement;
    mapElement.style.transform = `scale(${0.5}) translateX(-50%) translateY(-50%)`;
    mapElement.style.width = "200%";
    mapElement.style.height = "90vh";
    mapElement.style.overflow = "auto";
    (document.getElementsByClassName('zoomInButtonDiv')[0] as HTMLDivElement).style.display = "block";
    let styleElement = document.getElementById('dynamic-scrollbar-style') as HTMLStyleElement;
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = 'dynamic-scrollbar-style';
      document.head.appendChild(styleElement);
    }
    styleElement.textContent = `
    .map::-webkit-scrollbar {
      width: 28px;
      height: 28px;
    } 
  `;
  }
  zoomIn() {
    const mapElement = document.getElementsByClassName('map')[0] as HTMLDivElement;
    mapElement.style.transform = ``;
    mapElement.style.width = "";
    mapElement.style.height = "";
    (document.getElementsByClassName('zoomInButtonDiv')[0] as HTMLDivElement).style.display = "none";
    const styleElement = document.getElementById('dynamic-scrollbar-style') as HTMLStyleElement;
    if (styleElement) {
      styleElement.parentNode?.removeChild(styleElement);
    }
  }
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

  scrollToCoordinatesByString(coordsX: string, coordsY: string, hideAttackButton?: boolean) {
    this.scrollToCoordinates(parseInt(coordsX), parseInt(coordsY), hideAttackButton);
  }

  getSrcForBase(baseLvl: string) {
    const num = parseInt(baseLvl);
    if (num) {
      return num >= 35 ? this.lvl3Src : num > 20 ? this.lvl2Src : this.lvl1Src;
    }
    return;
  }

  setMapData(nexusBases: NexusBase[]) {
    if (this.isMapRendered) return;
    this.startLoading();
    this.mapData = nexusBases;
    this.isMapRendered = true;

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
    this.stopLoading();
  }

  scrollToUserBase() {
    setTimeout(() => {
      if (this.nexusBase) {
        this.scrollToCoordinates(this.nexusBase?.coordsX, this.nexusBase?.coordsY);
      }
    }, 10);
  }

  showAttackScreen(isDefence: boolean) {
    if (this.selectedNexusBase?.coordsX === this.nexusBase?.coordsX &&
      this.selectedNexusBase?.coordsY === this.nexusBase?.coordsY) {
      return alert("Cannot attack or defend the same base.");
    }
    this.startLoading();
    if ((this.unitStats?.length ?? 0) > 1) {
      this.unitStats?.sort((a, b) => a.cost - b.cost);
    }
    this.isAttackScreenOpen = true;
    this.showAttackButton = false;
    this.isSendingDefence = isDefence;
    this.stopLoading();
  }

  emittedClosedAttackScreen() {
    this.showAttackButton = true;
    this.isAttackScreenOpen = false;

    this.updateAttackTimers();
    this.updateDefenceTimers();
  }

  emittedAttack(attack: NexusAttackSent) {
    this.startLoading();
    setTimeout(() => {
      this.emittedAttackEvent.emit({ attack: attack, isSendingDefence: this.isSendingDefence, switchBase: this.switchNextBaseCheckbox.nativeElement.checked } as AttackEventPayload); 
      this.stopLoading();
    }, 10);
  }

  clearMapInputs() {
    this.mapInputX.nativeElement.value = '';
    this.mapInputY.nativeElement.value = '';
  }
  showMapLocation() {
    const x = parseInt(this.mapInputX.nativeElement.value, 10);
    const y = parseInt(this.mapInputY.nativeElement.value, 10);
     
    if (isNaN(x) || isNaN(y) || x < 0 || y < 0 || x >= this.grid[0].length || y >= this.grid.length) {
      alert("Invalid Coordinates.");
      return;
    }

    this.scrollToCoordinates(x, y);
  } 

  generateRandomRotations() {
    const possibleRotations = [0, 180, 270];
    const rotationCount = possibleRotations.length; 
    this.randomRotations = Array.from({ length: this.grid.length }, () => new Array(this.grid[0].length));

    for (let y = 0; y < this.grid.length; y++) {
      const row = this.randomRotations[y];
      for (let x = 0; x < row.length; x++) {
        row[x] = possibleRotations[Math.floor(Math.random() * rotationCount)];
      }
    }
  }

  hash(x: number, y: number): number {
    const seed = (x * 73856093) ^ (y * 19349663);
    const lcg = (seed * 1664525 + 1013904223) & 0xffffffff;
    return (lcg % 3) + 1;
  }
  getRandomEmptyMapTile(x: number, y: number) {
    const tileSources = [this.mapTileSrc3, this.mapTileSrc, this.mapTileSrc2]; 
    return tileSources[this.randomMap[y][x]] || this.mapTileSrc3;
  }
  generateRandomMap(gridSizeX: number, gridSizeY: number): number[][] {
    const randomMap: number[][] = new Array(gridSizeY);
     
    for (let y = 0; y < gridSizeY; y++) {
      const row: number[] = new Array(gridSizeX); 
      for (let x = 0; x < gridSizeX; x++) {
        row[x] = this.hash(x, y);
      }
      randomMap[y] = row;
    }

    return randomMap;
  }

  selectCoordinates(coordsX: number, coordsY: number) { 
    if (this.selectedNexusBase?.coordsX === coordsX && this.selectedNexusBase?.coordsY === coordsY) return;
     
    this.selectedNexusBase = undefined;
    this.showAttackButton = true;
    this.isReportsHidden = true;
    this.isAttackScreenOpen = false;
    if (this.unitStats) {
      this.unitStats.forEach(stat => stat.sentValue = undefined);
    }
     
    this.selectedNexusBase = this.mapData.find(base => base.coordsX === coordsX && base.coordsY === coordsY) || {
      coordsX,
      coordsY,
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

    // Update attack and defence timers
    this.updateAttackTimers();
    this.updateDefenceTimers();
  }

  getAttackTimers(): NexusTimer[] {
    return Object.values(this.attackTimers);
  }
  getDefenceTimers(): NexusTimer[] {
    return Object.values(this.defenceTimers);
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
    const targetBase = this.mapData.find(base => base.coordsX === x && base.coordsY === y);

    if (!targetBase || !targetBase.user || !this.user) {
      return "emptyBase";
    }

    return targetBase.user.id === this.user.id ? "myBase" : "enemyBase";
  }

  isAttackSentOn(x: number, y: number) {
    if (!this.nexusAttacksSent && !this.nexusDefencesSent) return false;
    if (this.nexusAttacksSent) {
      const relevantAttack = this.nexusAttacksSent.find(nb => !(nb.destinationCoordsX == nb.originCoordsX && nb.destinationCoordsY == nb.originCoordsY) && nb.destinationCoordsX == x && nb.destinationCoordsY == y);
      if (relevantAttack) return true;
    }

    if (this.nexusAttacksIncoming) {
      return this.nexusAttacksIncoming.some(nb => !(nb.destinationCoordsX == nb.originCoordsX && nb.destinationCoordsY == nb.originCoordsY) && nb.destinationCoordsX == x && nb.destinationCoordsY == y && ((nb.originUser?.id ?? 0) != (this.user?.id ?? 0)));
    }
    return false;
  }
  isAttackReturningOn(x: number, y: number) {
    if (!this.nexusAttacksSent) return false;
    
    let relevantAttack = this.nexusAttacksSent.find(
      nb => nb.destinationCoordsX == x && nb.destinationCoordsY == y
        && nb.originCoordsX == x && nb.originCoordsY == y
        && nb.destinationUser?.id == this.parentRef?.user?.id
    ) as NexusAttackSent || undefined; 
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

  private async reinitializeAttackTimers() {
    Object.keys(this.attackTimers).forEach(attack => {
      if (this.attackTimers[attack]) {
        clearInterval(this.attackTimers[attack].interval);
        clearTimeout(this.attackTimers[attack].timeout);
        delete this.attackTimers[attack];
      }
    });
    this.attackTimers = {};
  }

  private async reinitializeDefenceTimers() {
    Object.keys(this.defenceTimers).forEach(defence => {
      if (this.defenceTimers[defence]) {
        clearInterval(this.defenceTimers[defence].interval);
        clearTimeout(this.defenceTimers[defence].timeout);
        delete this.defenceTimers[defence];
      }
    });
    this.defenceTimers = {};
  }
  private startAttackTimer(attack: string, time: number, object: object) {
    if (this.attackTimers[attack] || !time || isNaN(time)) {
      return;
    }
    const endTime = Math.max(1, time);
    const timer = {
      key: attack,
      object: object,
      endTime: endTime,
      timeout: setTimeout(async () => {
        clearInterval(this.attackTimers[attack].interval);
        clearTimeout(this.attackTimers[attack].timeout);
        delete this.attackTimers[attack];
      }, endTime * 1000),
      interval: setInterval(() => {
        if (this.attackTimers[attack]) {
          this.attackTimers[attack].endTime--;
        }
      }, 1000)
    };

    this.attackTimers[attack] = timer;
  }


  private startDefenceTimer(defence: string, time: number, object: object) {
    if (this.defenceTimers[defence] || !time || isNaN(time)) {
      return;
    }
    const endTime = Math.max(1, time);
    const timer = {
      key: defence,
      object: object,
      endTime: endTime,
      timeout: setTimeout(async () => {
        clearInterval(this.defenceTimers[defence].interval);
        clearTimeout(this.defenceTimers[defence].timeout);
        delete this.defenceTimers[defence];
      }, endTime * 1000),
      interval: setInterval(() => {
        if (this.defenceTimers[defence]) {
          this.defenceTimers[defence].endTime--;
        }
      }, 1000)
    };

    this.defenceTimers[defence] = timer;
  }

  private updateAttackTimers(forceUpdateDefenceTimers?: boolean) {
    this.reinitializeAttackTimers();

    if (this.nexusAttacksSent && this.nexusAttacksSent.length > 0 && this.nexusBase) {
      let count = 0;
      const uniqueAttacks = new Set<number>(); // Set to keep track of unique attacks
      const relevantAttacksSent = this.nexusAttacksSent.filter(x => x.destinationCoordsX == this.selectedNexusBase?.coordsX && x.destinationCoordsY == this.selectedNexusBase.coordsY);
      //console.log(this.nexusAttacksSent);
      relevantAttacksSent.forEach(x => {
        const startTimeTime = new Date(x.timestamp).getTime();
        const utcNow = new Date().getTime();
        const elapsedTimeInSeconds = Math.floor((utcNow - startTimeTime)) / 1000;
        const remainingTimeInSeconds = x.duration - elapsedTimeInSeconds;
        count++;
        if (x.originCoordsX == x.destinationCoordsX && x.originCoordsY == x.destinationCoordsY) {
          const salt = `{${x.originCoordsX},${x.originCoordsY}} ${count}. Returning {${x.destinationCoordsX},${x.destinationCoordsY}}`;
          if (!uniqueAttacks.has(remainingTimeInSeconds) && !this.attackTimers[salt] && remainingTimeInSeconds > 0) {
            uniqueAttacks.add(remainingTimeInSeconds);
            this.startAttackTimer(salt, remainingTimeInSeconds, x);
          }
        } else {
          const isChallenger = x.originUser?.id != x.destinationUser?.id;
          const salt = `{${x.originCoordsX},${x.originCoordsY}} ${count}. ${isChallenger ? 'Attacking' : 'Incoming'} {${x.destinationCoordsX},${x.destinationCoordsY}}`;
          if (!uniqueAttacks.has(remainingTimeInSeconds) && !this.attackTimers[salt] && remainingTimeInSeconds > 0) {
            uniqueAttacks.add(remainingTimeInSeconds);
            this.startAttackTimer(salt, remainingTimeInSeconds, x);
          }
        }

      });
    }
    if (this.nexusAttacksIncoming && this.nexusAttacksIncoming.length > 0 && this.nexusBase) {
      let count = 0;
      const uniqueAttacks = new Set<number>(); // Set to keep track of unique attacks
      const relevantAttacks = this.nexusAttacksIncoming.filter(x => x.destinationCoordsX == this.selectedNexusBase?.coordsX && x.destinationCoordsY == this.selectedNexusBase.coordsY && x.destinationCoordsX != x.originCoordsX && x.destinationCoordsY != x.originCoordsY);
      //console.log(this.nexusAttacksSent);
      relevantAttacks.forEach(x => {
        const startTimeTime = new Date(x.timestamp).getTime();
        const utcNow = new Date().getTime();
        const elapsedTimeInSeconds = Math.floor((utcNow - startTimeTime)) / 1000;
        const remainingTimeInSeconds = x.duration - elapsedTimeInSeconds;
        count++;

        const salt = `{${x.originCoordsX},${x.originCoordsY}} ${count}. Attacking {${x.destinationCoordsX},${x.destinationCoordsY}}`;
        if (!uniqueAttacks.has(remainingTimeInSeconds) && !this.attackTimers[salt] && remainingTimeInSeconds > 0) {
          uniqueAttacks.add(remainingTimeInSeconds);
          this.startAttackTimer(salt, remainingTimeInSeconds, x);
        }


      });
    }

    if (forceUpdateDefenceTimers) {
      this.updateAttackDefenceTimers();
    }
  }

  private updateAttackDefenceTimers() {
    if (this.nexusAttacksIncoming && this.nexusAttacksIncoming.length > 0) {
      let count = 0;
      const uniqueDefenses = new Set<string>();
      const relevantAttacksReceived =
        this.nexusAttacksIncoming.filter(x => x.destinationCoordsX == this.selectedNexusBase?.coordsX && x.destinationCoordsY == this.selectedNexusBase.coordsY
          && x.originUser?.id != this.inputtedParentRef?.user?.id);

      relevantAttacksReceived.forEach(x => {
        const startTimeTime = new Date(x.timestamp).getTime();
        const utcNow = new Date().getTime();
        const elapsedTimeInSeconds = Math.floor((utcNow - startTimeTime)) / 1000;
        const remainingTimeInSeconds = x.duration - elapsedTimeInSeconds;
        count++;
        const salt = `{${x.destinationCoordsX},${x.destinationCoordsY}} ${count}. Incoming {${x.originCoordsX},${x.originCoordsY}}`;

        if (remainingTimeInSeconds > 0) {
          if (!uniqueDefenses.has(salt)) {
            uniqueDefenses.add(salt);
            this.startAttackTimer(salt, remainingTimeInSeconds, x);
          }
        }
      });
    }
  }
  private incomingFromNexusDefencesIncoming() {
    return this.nexusDefencesIncoming
      && this.nexusDefencesIncoming.some(x => !x.arrived && x.destinationCoordsX == this.selectedNexusBase?.coordsX && x.destinationCoordsY == this.selectedNexusBase.coordsY
        && (x.marineTotal > 0 || x.siegeTankTotal > 0 || x.goliathTotal > 0 || x.scoutTotal > 0 || x.wraithTotal > 0 || x.battlecruiserTotal > 0 || x.glitcherTotal > 0));
  }
  private incomingFromNexusDefencesSent() {
    return this.nexusDefencesSent && this.nexusDefencesSent.some(x => !x.arrived && x.destinationCoordsX == this.selectedNexusBase?.coordsX && x.destinationCoordsY == this.selectedNexusBase.coordsY
      && (x.marineTotal > 0 || x.siegeTankTotal > 0 || x.goliathTotal > 0 || x.scoutTotal > 0 || x.wraithTotal > 0 || x.battlecruiserTotal > 0 || x.glitcherTotal > 0));
  }
  private updateDefenceTimers() {
    this.reinitializeDefenceTimers();
    if (this.incomingFromNexusDefencesIncoming() || this.incomingFromNexusDefencesSent()) {

      let count = 0;
      if (this.nexusDefencesIncoming) {
        this.nexusDefencesIncoming.forEach(x => {
          if (!x.arrived && x.destinationCoordsX == this.selectedNexusBase?.coordsX && x.destinationCoordsY == this.selectedNexusBase?.coordsY) {
            //console.log(`${x.destinationCoordsX} == ${this.selectedNexusBase?.coordsX} && ${x.destinationCoordsY} == ${this.selectedNexusBase?.coordsY}`);
            const startTimeTime = new Date(x.timestamp).getTime();
            const utcNow = new Date().getTime();
            const elapsedTimeInSeconds = Math.floor((utcNow - startTimeTime)) / 1000;
            const timeDuration = x.duration;

            if (this.nexusBase) {
              const remainingTimeInSeconds = timeDuration - elapsedTimeInSeconds;
              //console.log(x);
              //console.log(remainingTimeInSeconds); 
              /*console.log(salt);*/
              if (remainingTimeInSeconds > 0) {
                let salt = "";
                if (x.originCoordsX == x.destinationCoordsX && x.originCoordsY == x.destinationCoordsY) {
                  salt = `{${x.originCoordsX},${x.originCoordsY}} ${++count}. Support returning to {${x.destinationCoordsX},${x.destinationCoordsY}}`;
                } else {
                  salt = `{${x.originCoordsX},${x.originCoordsY}} ${++count}. Supporting {${x.destinationCoordsX},${x.destinationCoordsY}}`;
                }
                this.startDefenceTimer(salt, remainingTimeInSeconds, x);
              }
            }
          }
        });
      }

      if (this.nexusDefencesSent) {
        console.log("updating defence sent");
        let count = 0;
        this.nexusDefencesSent.forEach(x => {
          if (!x.arrived) {
            const startTimeTime = new Date(x.timestamp).getTime();
            const utcNow = new Date().getTime();
            const elapsedTimeInSeconds = Math.floor((utcNow - startTimeTime)) / 1000;
            const timeDuration = x.duration;

            if (this.selectedNexusBase && x.destinationCoordsX == this.selectedNexusBase.coordsX && x.destinationCoordsY == this.selectedNexusBase.coordsY) {
              const remainingTimeInSeconds = timeDuration - elapsedTimeInSeconds;
              let salt = "";
              if (x.originCoordsX == x.destinationCoordsX && x.originCoordsY == x.destinationCoordsY) {
                salt = `{${x.originCoordsX},${x.originCoordsY}} ${++count}. Support returning to {${x.destinationCoordsX},${x.destinationCoordsY}}`;
              } else {
                salt = `{${x.originCoordsX},${x.originCoordsY}} ${++count}. Supporting {${x.destinationCoordsX},${x.destinationCoordsY}}`;
              }
              /*console.log(salt);*/
              this.startDefenceTimer(salt, remainingTimeInSeconds, x);
            }
          }
        });
      }
    }
  }
  getRestOfAttackLabel(label: NexusTimer): string {
    const parts = label.key.split('.');
    return parts[1] ? parts[1].trim() : '';
  }
  getAttackerLabel(label: NexusTimer): string {
    const as = (label.object as NexusAttackSent);
    return `{${as.originCoordsX},${as.originCoordsY}}`;
  }

  scrollToCoordinatesFromAttackTimer(attackTimer: NexusTimer) {
    const key = attackTimer.key;
    const coordPart = key.split(' ')[0];
    const coordX = coordPart.substring(1, coordPart.indexOf(','));
    const coordY = coordPart.substring(coordPart.indexOf(',') + 1, coordPart.length - 1);
    this.scrollToCoordinatesByString(coordX, coordY);
  }
  trackByIndex(index: number): number {
    return index;
  }
  getImageSrc(x: number, y: number) {
    return this.grid[x][y] ? this.getSrcForBase(this.grid[x][y]) : this.getRandomEmptyMapTile(x, y);
  }

  getImageTransform(x: number, y: number): string {
    return !this.grid[x][y] ? 'rotate(' + this.randomRotations[y][x] + 'deg)' : '';
  }
  shouldShowMapInputs(): boolean {
    return (this.selectedNexusBase && !this.isAttackScreenOpen && this.mapInputX && this.mapInputY) ? true : false;
  }
  onMapInputChange(value: string) {
    this.searchTerm.next(value);
  }
}
