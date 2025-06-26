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
import { NexusAttackScreenComponent } from '../nexus-attack-screen/nexus-attack-screen.component';
import { ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';

@Component({
    selector: 'app-nexus-map',
    templateUrl: './nexus-map.component.html',
    styleUrl: './nexus-map.component.css',
    standalone: false,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class NexusMapComponent extends ChildComponent {
  selectedNexusBase?: NexusBase;
  grid: string[][] = [];
  isAttackScreenOpen = false;
  showAttackButton = false;
  isReportsHidden = true;
  isSendingDefence = false;
  isMapRendered = false;
  showWarning = false;
  randomRotations: number[][] = [];
  randomMap: number[][] = [];
  searchTerm = new Subject<string>();
  tileSources = [this.mapTileSrc3, this.mapTileSrc, this.mapTileSrc2];
  zoomedOut = false;
  attackTimers: { [key: string]: NexusTimer } = {};
  defenceTimers: { [key: string]: NexusTimer } = {};
  isMapInfoOpen = false;
  componentMainWidth? : string; 

  public attackSentStatus: Map<string, boolean> = new Map();
  public attackReturningStatus: Map<string, boolean> = new Map();
  public defenseSentStatus: Map<string, boolean> = new Map();

  @Input() mapData?: NexusBase[] = [];
  @Input() currentPersonalBases?: NexusBase[] = [];
  @Input() user?: User;
  @Input() nexusAvailableUnits?: NexusUnits;
  @Input() nexusUnitsOutsideOfBase?: NexusUnits;
  @Input() nexusBase?: NexusBase;
  @Input() cclvl1Src?: string;
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
  @Input() splvl1Src: string | undefined;
  @Input() sdlvl1Src: string | undefined;
  @Input() whlvl1Src: string | undefined;
  @Input() eblvl1Src: string | undefined;
  @Input() mineslvl1Src: string | undefined;
  @Input() flvl1Src: string | undefined;
  @Input() playerColors?: { [key: number]: string } = [];
  @Input() protectedPlayerIds?: number[] | undefined;
  @Input() protectedBaseCoordinates: [number, number][] = [];


  @Input() numberOfPersonalBases: number | undefined;
  @Input() unitStats?: UnitStats[];
  @Input() inputtedParentRef?: AppComponent;
  @Input() nexusAttacksSent?: NexusAttackSent[];
  @Input() nexusDefencesSent?: NexusAttackSent[];
  @Input() nexusAttacksIncoming?: NexusAttackSent[];
  @Input() nexusDefencesIncoming?: NexusAttackSent[];
  @Input() isLoadingData?: boolean = false;

  @Output() emittedReloadEvent = new EventEmitter<string>();
  @Output() emittedNotifications = new EventEmitter<string>();
  @Output() emittedGoToBaseEvent = new EventEmitter<NexusBase>();
  @Output() emittedAttackEvent = new EventEmitter<AttackEventPayload>();
  @Output() emittedSendBackAttackEvent = new EventEmitter<object>();
  @Output() emittedSendBackDefenceEvent = new EventEmitter<object>();
  @Output() emittedZoomInEvent = new EventEmitter<void>();
  @Output() emittedZoomOutEvent = new EventEmitter<void>();

  @ViewChild('mapInputX') mapInputX!: ElementRef<HTMLInputElement>;
  @ViewChild('mapInputY') mapInputY!: ElementRef<HTMLInputElement>;
  @ViewChild('mapContainer') mapContainer!: ElementRef;
  @ViewChild('switchNextBaseCheckbox') switchNextBaseCheckbox!: ElementRef<HTMLInputElement>;
  @ViewChild('attackModeCheckbox') attackModeCheckbox!: ElementRef<HTMLInputElement>;
  @ViewChild('engageModeCheckbox') engageModeCheckbox!: ElementRef<HTMLInputElement>;
  @ViewChild(NexusReportsComponent) nexusReports!: NexusReportsComponent;
  @ViewChild(NexusAttackScreenComponent) nexusAttackScreenComponent!: NexusAttackScreenComponent;


  constructor(private nexusService: NexusService, private cdr: ChangeDetectorRef) {
    super();
    this.searchTerm.pipe(debounceTime(300)).subscribe(() => {
      this.showMapLocation();
    });
  }

  zoomOut() {
    this.zoomedOut = true;
    this.setComponentMainWidth();

    const mapElement = document.getElementsByClassName('map')[0] as HTMLDivElement;
    mapElement.style.transform = `scale(${0.5}) translateX(-50%) translateY(-50%)`;
    mapElement.style.width = "200%";
    mapElement.style.height = "CALC(200vh - 200px)";
    mapElement.style.overflow = "auto";

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
    this.resetSwitches();
    this.emittedZoomOutEvent.emit();
  }
  
  resetSwitches() {
    if (this.attackModeCheckbox)
      this.attackModeCheckbox.nativeElement.checked = false;
    if (this.switchNextBaseCheckbox)
      this.switchNextBaseCheckbox.nativeElement.checked = false;
    if (this.engageModeCheckbox)
      this.engageModeCheckbox.nativeElement.checked = false;
  }
  resetStatuses() {
    this.attackSentStatus = new Map();
    this.attackReturningStatus = new Map();
    this.defenseSentStatus = new Map();
  }
  zoomIn() {
    this.zoomedOut = false
    const mapElement = document.getElementsByClassName('map')[0] as HTMLDivElement;
    mapElement.style.transform = ``;
    mapElement.style.width = "";
    mapElement.style.height = "";

    const styleElement = document.getElementById('dynamic-scrollbar-style') as HTMLStyleElement;
    if (styleElement) {
      styleElement.parentNode?.removeChild(styleElement);
    }

    this.resetComponentMainWidth();
    this.resetSwitches();
    this.emittedZoomInEvent.emit();
  }

  public setComponentMainWidth() {
    const componentMain = document.getElementsByClassName('componentMain')[0] as HTMLDivElement;
    if (componentMain) {
      if (!this.componentMainWidth) {
        const computedStyle = window.getComputedStyle(componentMain);
        this.componentMainWidth = computedStyle.width;
      }
      componentMain.style.width = "100vw";
    }
  }

  public resetComponentMainWidth() {
    if (!this.componentMainWidth) { return; }
    const componentMain = document.getElementsByClassName('componentMain')[0] as HTMLDivElement;
    if (componentMain) { 
      componentMain.style.width = this.componentMainWidth;
      this.componentMainWidth = undefined;
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

    this.resetSwitches();
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

  setMapData() {
    if (this.isMapRendered || !this.mapData) return;
    this.startLoading();
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
    this.tileSources = [this.mapTileSrc3, this.mapTileSrc, this.mapTileSrc2];
    this.randomMap = this.generateRandomMap(100, 100);

    this.computeStatuses();
    this.stopLoading();
    this.cdr.markForCheck();
  }

  scrollToUserBase() {
    setTimeout(() => {
      if (this.nexusBase) {
        this.scrollToCoordinates(this.nexusBase?.coordsX, this.nexusBase?.coordsY);
      }
    }, 10);
  }

  showAttackScreen(isDefence: boolean) {
    const isChecked = this.switchNextBaseCheckbox?.nativeElement?.checked;

    if (this.zoomedOut) {
      this.zoomIn();
    }

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
    if (this.switchNextBaseCheckbox) {
      this.switchNextBaseCheckbox.nativeElement.checked = isChecked;
    }

    this.stopLoading();
  }

  emittedClosedAttackScreen() {
    this.showAttackButton = true;
    this.isAttackScreenOpen = false;
    this.updateAttackTimers();
    this.updateDefenceTimers();
  }

  emittedGoToCoords(coords: [number, number]) {
    this.scrollToCoordinates(coords[0], coords[1]);
  }

  emittedAttack(attack: NexusAttackSent) {
    this.startLoading();
    this.updateStatusForAttack(attack);

    setTimeout(() => {
      this.emittedAttackEvent.emit({ attack: attack, isSendingDefence: this.isSendingDefence, switchBase: (this.switchNextBaseCheckbox?.nativeElement?.checked ?? false)} as AttackEventPayload);
      this.stopLoading();
    }, 10);
  }

  private updateStatusForAttack(attack: NexusAttackSent) {
    const key = `${attack.destinationCoordsX},${attack.destinationCoordsY}`;

    if (this.isSendingDefence) {
      // Update defenseSentStatus
      const isDefense = !attack.arrived; // Adjust this based on your defense logic
      this.defenseSentStatus.set(key, isDefense);
    } else {
      // Update attackSentStatus
      const isSent = attack.originCoordsX !== attack.destinationCoordsX || attack.originCoordsY !== attack.destinationCoordsY;
      this.attackSentStatus.set(key, isSent);

      // Update attackReturningStatus
      const isReturning = attack.originCoordsX === attack.destinationCoordsX && attack.originCoordsY === attack.destinationCoordsY;
      this.attackReturningStatus.set(key, isReturning);
    }
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
    return this.tileSources[this.randomMap[y][x]] || this.mapTileSrc3;
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
    if (this.selectedNexusBase?.coordsX === coordsX && this.selectedNexusBase?.coordsY === coordsY) {
      return;
    }
    this.selectedNexusBase = undefined;
    this.showAttackButton = true;
    if (!this.attackModeCheckbox || !this.attackModeCheckbox.nativeElement.checked) {
      this.isAttackScreenOpen = false;
    }
    this.isReportsHidden = true;
    if (this.unitStats) {
      this.unitStats.forEach(stat => stat.sentValue = undefined);
    }
    this.selectedNexusBase = this.mapData?.find(base => base.coordsX === coordsX && base.coordsY === coordsY) || {
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
      conquered: new Date(),
    };
    if (this.engageModeCheckbox && this.engageModeCheckbox.nativeElement.checked && this.nexusAttackScreenComponent) {
      this.nexusAttackScreenComponent.engageAttackAllUnits();
    }
    setTimeout(() => {
      if (!this.isAttackScreenOpen) {
        this.updateAttackTimers();
        this.updateDefenceTimers();
      }
    }, 100);
    this.cdr.markForCheck();
  }


  getRelevantAttacksForSelectedBase(): NexusAttackSent[] {
    if (!this.selectedNexusBase) return [];

    const coordsX = this.selectedNexusBase.coordsX;
    const coordsY = this.selectedNexusBase.coordsY;
    const key = `${coordsX},${coordsY}`;

    // Initialize an empty array to store the relevant attacks
    const relevantAttacks: NexusAttackSent[] = [];

    // Check if the map contains the key for attackSentStatus
    if (this.attackSentStatus.get(key) && this.nexusAttacksSent) {
      // Find attacks that are sent to the selected coordinates
      relevantAttacks.push(...this.nexusAttacksSent.filter(attack =>
        attack.destinationCoordsX === coordsX && attack.destinationCoordsY === coordsY
      ));
    }

    // Check if the map contains the key for attackReturningStatus
    if (this.attackReturningStatus.get(key) && this.nexusAttacksSent) {
      // Find attacks that are returning to the selected coordinates
      relevantAttacks.push(...this.nexusAttacksSent.filter(attack =>
        attack.originCoordsX === coordsX && attack.originCoordsY === coordsY &&
        attack.destinationCoordsX !== attack.originCoordsX && attack.destinationCoordsY !== attack.originCoordsY
      ));
    }

    return relevantAttacks;
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
    if (!this.isReportsHidden && this.selectedNexusBase && this.nexusReports) {
      this.nexusReports.loadBattleReports(this.selectedNexusBase);
    }

    this.resetSwitches();
  }
  getBaseAllianceSpanClass(x: number, y: number) {
    if (!this.mapData) return "emptyBase";

    const targetBase = this.mapData.find(base => base.coordsX === x && base.coordsY === y);

    if (!targetBase || !targetBase.user || !this.user) {
      return "emptyBase";
    }

    return targetBase.user.id === this.user.id ? "myBase" : "enemyBase";
  }
  getHalfAndHalfStyle(x: number, y: number): string {
    const baseColor = this.getBaseAllianceSpanClass(x, y) === 'myBase' ? 'chartreuse' : 'orangered';  // Example base colors
    const playerColor = this.getPlayerColor(x, y);  // Get the player's color

    // Return the linear-gradient background style as a string
    return `linear-gradient(to right, ${baseColor} 50%, ${playerColor} 50%)`;
  }
  getPlayerColor(x: number, y: number) {
    const targetBase = this.mapData?.find(base => base.coordsX === x && base.coordsY === y);
    if (targetBase) {
      return this.playerColors ? "#"+ this.playerColors[targetBase.user?.id ?? 0] : '#FFFFFF';
    }
    return '#FFFFFF';
  }
  computeStatuses() { 
    const attackSentStatus = this.attackSentStatus;
    const attackReturningStatus = this.attackReturningStatus;
    const defenseSentStatus = this.defenseSentStatus;

    for (const attack of this.nexusAttacksSent ?? []) {
      const destinationKey = `${attack.destinationCoordsX},${attack.destinationCoordsY}`;
      const isSent = attack.originCoordsX !== attack.destinationCoordsX || attack.originCoordsY !== attack.destinationCoordsY;
      const isReturning = attack.originCoordsX === attack.destinationCoordsX && attack.originCoordsY === attack.destinationCoordsY;

      attackSentStatus.set(destinationKey, isSent);
      attackReturningStatus.set(destinationKey, isReturning);
    }

    for (const attack of this.nexusAttacksIncoming ?? []) {
      const destinationKey = `${attack.destinationCoordsX},${attack.destinationCoordsY}`;
      const isSent = attack.originCoordsX !== attack.destinationCoordsX || attack.originCoordsY !== attack.destinationCoordsY;
      const isReturning = attack.originCoordsX === attack.destinationCoordsX && attack.originCoordsY === attack.destinationCoordsY;

      attackSentStatus.set(destinationKey, isSent); 
    }

    for (const defense of this.nexusDefencesSent ?? []) {
      const destinationKey = `${defense.destinationCoordsX},${defense.destinationCoordsY}`;
      defenseSentStatus.set(destinationKey, !defense.arrived);
    }
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
        this.computeStatuses();
        this.updateAttackTimers();
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
        this.computeStatuses();
        this.updateDefenceTimers();
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
    if (this.isAttackScreenOpen) return;

    this.reinitializeAttackTimers();

    if (this.selectedNexusBase) {

      const coordsX = this.selectedNexusBase.coordsX;
      const coordsY = this.selectedNexusBase.coordsY;
      const key = `${coordsX},${coordsY}`;

      // Filter attacks based on the map
      let relevantAttacks: NexusAttackSent[] = [];

      // Find defenses sent to the selected coordinates
      if (this.attackSentStatus.get(key)) {
        relevantAttacks.push(...this.nexusAttacksSent?.filter(defense =>
          defense.destinationCoordsX === coordsX && defense.destinationCoordsY === coordsY
        ) || []);
      }

      let relevantAttacksIncoming = this.nexusAttacksIncoming?.filter(attack =>
        attack.destinationCoordsX === this.selectedNexusBase?.coordsX &&
        attack.destinationCoordsY === this.selectedNexusBase?.coordsY
      );

      this.processAttackTimers(relevantAttacks ?? [], this.selectedNexusBase, 5);
      this.processAttackTimers(relevantAttacksIncoming ?? [], this.selectedNexusBase, 5, true);

      if (forceUpdateDefenceTimers) {
        this.updateAttackDefenceTimers();
      }
    }
  }

  private processAttackTimers(attacks: any[], base: any, maxCount: number, isIncoming: boolean = false) {
    if (!attacks || attacks.length == 0) return;
    let count = 0;
    const uniqueAttacks = new Set<number>();
    const utcNow = Date.now();

    for (const attack of attacks) {
      if (count >= maxCount) break;

      const { originCoordsX, originCoordsY, destinationCoordsX, destinationCoordsY, timestamp, duration, id, originUser, destinationUser } = attack;

      const elapsedTimeInSeconds = (utcNow - new Date(timestamp).getTime()) / 1000;
      const remainingTimeInSeconds = duration - elapsedTimeInSeconds;
      if (remainingTimeInSeconds <= 0) continue;

      const isSameLocation = originCoordsX === destinationCoordsX && originCoordsY === destinationCoordsY;
      const isChallenger = originUser?.id !== destinationUser?.id;
      const salt = isSameLocation
        ? `{${originCoordsX},${originCoordsY}} ${++count}. Returning`
        : `{${originCoordsX},${originCoordsY}} ${++count}. ${isChallenger ? 'Attacking' : 'Incoming'} {${destinationCoordsX},${destinationCoordsY}}`;

      if (!uniqueAttacks.has(id) && !this.attackTimers[salt]) {
        uniqueAttacks.add(id);
        this.startAttackTimer(salt, remainingTimeInSeconds, attack);
      }
    }
  }
  private updateAttackDefenceTimers() {
    if (this.isAttackScreenOpen || !this.selectedNexusBase) return;

    const coordsKey = `${this.selectedNexusBase.coordsX},${this.selectedNexusBase.coordsY}`;

    if (this.attackReturningStatus.has(coordsKey)) {
      const relevantAttacksReceived = this.nexusAttacksIncoming?.filter(attack =>
        attack.originUser?.id !== this.inputtedParentRef?.user?.id
      );

      if (relevantAttacksReceived && relevantAttacksReceived.length > 0) {
        this.processDefenceTimers(relevantAttacksReceived, 5);
      }
    }
  }

  private updateDefenceTimers() {
    if (this.isAttackScreenOpen || !this.selectedNexusBase) return; 
    this.reinitializeDefenceTimers();

    const coordsKey = `${this.selectedNexusBase.coordsX},${this.selectedNexusBase.coordsY}`;

    if (this.defenseSentStatus.has(coordsKey)) {
      const defences = [
        ...(this.nexusDefencesIncoming?.filter(defense =>
          !defense.arrived &&
          defense.destinationCoordsX === this.selectedNexusBase?.coordsX &&
          defense.destinationCoordsY === this.selectedNexusBase?.coordsY
        ) || []),
        ...(this.nexusDefencesSent?.filter(defense =>
          !defense.arrived &&
          defense.destinationCoordsX === this.selectedNexusBase?.coordsX &&
          defense.destinationCoordsY === this.selectedNexusBase?.coordsY
        ) || [])
      ];

      if (defences.length > 0) {
        this.processDefenceTimers(defences, 5);
      }
    }
  }

  private incomingFromNexusDefencesIncoming() {
    return this.nexusDefencesIncoming?.some(x =>
      !x.arrived &&
      x.destinationCoordsX === this.selectedNexusBase?.coordsX &&
      x.destinationCoordsY === this.selectedNexusBase.coordsY &&
      (x.marineTotal > 0 || x.siegeTankTotal > 0 || x.goliathTotal > 0 || x.scoutTotal > 0 || x.wraithTotal > 0 || x.battlecruiserTotal > 0 || x.glitcherTotal > 0)
    );
  }

  private incomingFromNexusDefencesSent() {
    return this.nexusDefencesSent?.some(x =>
      !x.arrived &&
      x.destinationCoordsX === this.selectedNexusBase?.coordsX &&
      x.destinationCoordsY === this.selectedNexusBase.coordsY &&
      (x.marineTotal > 0 || x.siegeTankTotal > 0 || x.goliathTotal > 0 || x.scoutTotal > 0 || x.wraithTotal > 0 || x.battlecruiserTotal > 0 || x.glitcherTotal > 0)
    );
  }

  private processDefenceTimers(attacks: any[], maxCount: number) {
    if (!attacks || attacks.length == 0) return;

    let count = 0;
    const uniqueDefenses = new Set<number>();
    const utcNow = Date.now();

    for (const attack of attacks) {
      if (count >= maxCount) break;

      const { destinationCoordsX, destinationCoordsY, originCoordsX, originCoordsY, timestamp, duration, id } = attack;
      const elapsedTimeInSeconds = (utcNow - new Date(timestamp).getTime()) / 1000;
      const remainingTimeInSeconds = duration - elapsedTimeInSeconds;

      if (remainingTimeInSeconds <= 0) continue;

      const isSameLocation = originCoordsX === destinationCoordsX && originCoordsY === destinationCoordsY;
      const salt = isSameLocation
        ? `{${originCoordsX},${originCoordsY}} ${++count}. Support returning to {${destinationCoordsX},${destinationCoordsY}}`
        : `{${originCoordsX},${originCoordsY}} ${++count}. Supporting {${destinationCoordsX},${destinationCoordsY}}`;

      if (!uniqueDefenses.has(id)) {
        uniqueDefenses.add(id);
        this.startDefenceTimer(salt, remainingTimeInSeconds, attack);
      }
    }
  }


  getRestOfAttackLabel(label: any): string {
    const obj = label as NexusAttackSent;
    return `{${obj.destinationCoordsX},${obj.destinationCoordsY}}`;
  }

  getAttackOrReturnLabel(attackTimer: any) {
    const attack = attackTimer.object as NexusAttackSent;
    return (attack.destinationCoordsX == attack.originCoordsX && attack.destinationCoordsY == attack.originCoordsY) ? "Returning" : "Attacking";
  }
  getAttackerLabel(label: NexusTimer): string {
    const obj = label.object as NexusAttackSent;
    return `{${obj.originCoordsX},${obj.originCoordsY}}`;
  }

  getAttackTimers(): NexusTimer[] {
    if (this.isAttackScreenOpen || !this.selectedNexusBase) return [];
    return Object.values(this.attackTimers);
  }

  getDefenceTimers(): NexusTimer[] {
    if (this.isAttackScreenOpen || !this.selectedNexusBase) return [];
    return Object.values(this.defenceTimers);
  }
  scrollToCoordinatesFromAttackTimer(attackTimer: any, fromOrigin: boolean) {
    const attack = attackTimer.object as NexusAttackSent;
    if (fromOrigin)
      this.scrollToCoordinates(attack.originCoordsX, attack.originCoordsY);
    else
      this.scrollToCoordinates(attack.destinationCoordsX, attack.destinationCoordsY);
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
  canSendUnitsBack(attack: object) {
    const na = attack as NexusAttackSent;
    return (na.originCoordsX != na.destinationCoordsX || na.originCoordsY != na.destinationCoordsY) && na.originUser?.id == this.user?.id && (new Date(na.timestamp) > new Date(Date.now() - 5 * 60000));
  }
  sendBackAttack(attackObject: object) {
    this.startLoading();
    this.emittedSendBackAttackEvent.emit(attackObject);

    const waitForParentLoadingToComplete = () => {
      if (!this.isLoadingData) {
        const x = this.selectedNexusBase?.coordsX;
        const y = this.selectedNexusBase?.coordsY;
        this.selectedNexusBase = undefined;
        setTimeout(() => {
          if (x && y) {
            this.resetStatuses();
            this.computeStatuses();
            this.selectCoordinates(x, y);
          }
        }, 500);
        this.stopLoading();
      } else {
        setTimeout(waitForParentLoadingToComplete, 10); // Adjust the delay as needed
      }
    };
    setTimeout(() => {
      waitForParentLoadingToComplete();
    }, 100);
  }
  sendBackDefence(attackObject: object) {
    this.startLoading();
    this.emittedSendBackDefenceEvent.emit(attackObject);

    const waitForParentLoadingToComplete = () => {
      if (!this.isLoadingData) {
        const x = this.selectedNexusBase?.coordsX;
        const y = this.selectedNexusBase?.coordsY;
        this.selectedNexusBase = undefined;
        setTimeout(() => {
          if (x && y) {
            this.resetStatuses();
            this.computeStatuses();
            this.selectCoordinates(x, y);
          } 
        }, 500);
        this.stopLoading();
      } else {
        setTimeout(waitForParentLoadingToComplete, 10); // Adjust the delay as needed
      }
    };
    setTimeout(() => {
      waitForParentLoadingToComplete();
    }, 100);
  }
  checkModes() {
    if (this.attackModeCheckbox.nativeElement.checked) {
      this.engageModeCheckbox.nativeElement.disabled = false;
    } else {
      this.engageModeCheckbox.nativeElement.checked = false;
      this.engageModeCheckbox.nativeElement.disabled = true;
    }
  }
  onMapInputChange(value: string) {
    this.searchTerm.next(value);
  }
  trackByTimerId(index: number, timer: NexusTimer): any {
    return timer.key;
  }
  showMapInfo(){
    this.isMapInfoOpen = true;
    const buttonsToHide = document.getElementsByClassName("switchBaseButtons");
    for (let x = 0; x < buttonsToHide.length; x++) {
      (buttonsToHide[x] as HTMLButtonElement).style.visibility = "hidden";
    }
    this.selectedNexusBase = undefined;
    this.emittedClosedAttackScreen();
  }
  closeMapInfo(){
    this.isMapInfoOpen = false;
    const buttonsToShow = document.getElementsByClassName("switchBaseButtons");
    for (let x = 0; x < buttonsToShow.length; x++) {
      (buttonsToShow[x] as HTMLButtonElement).style.visibility = "";
    }
  }
  userTagLoaded(user: User) {
    console.log("User tag loaded", user);
    this.cdr.markForCheck();
  }
  isProtected(x: number, y: number): boolean {
    return this.protectedBaseCoordinates.some(
      ([protectedX, protectedY]) => protectedX === x && protectedY === y
    );
  }
}
