import { Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild, output } from '@angular/core';
import { NexusBase } from '../../services/datacontracts/nexus/nexus-base';
import { NexusUnits } from '../../services/datacontracts/nexus/nexus-units';
import { UnitStats } from '../../services/datacontracts/nexus/unit-stats';
import { NexusService } from '../../services/nexus.service';
import { User } from '../../services/datacontracts/user/user';
import { ChildComponent } from '../child.component';
import { NexusAttackSent } from '../../services/datacontracts/nexus/nexus-attack-sent';
 

@Component({
  selector: 'app-nexus-attack-screen',
  templateUrl: './nexus-attack-screen.component.html',
  styleUrl: './nexus-attack-screen.component.css'
})
export class NexusAttackScreenComponent extends ChildComponent { 
  @Input() user?: User;
  @Input() originBase?: NexusBase;
  @Input() selectedNexus?: NexusBase;
  @Input() nexusAvailableUnits?: NexusUnits;
  @Input() nexusUnitsOutsideOfBase?: NexusUnits;
  @Input() unitStats?: UnitStats[];
  @Input() marinePictureSrc: string | undefined;
  @Input() goliathPictureSrc: string | undefined;
  @Input() siegeTankPictureSrc: string | undefined;
  @Input() scoutPictureSrc: string | undefined;
  @Input() wraithPictureSrc: string | undefined;
  @Input() battlecruiserPictureSrc: string | undefined;
  @Input() glitcherPictureSrc: string | undefined;
  @Input() isSendingDefence: boolean = false; 

  @Output() emittedNotifications = new EventEmitter<string>();
  @Output() emittedClosedAttackScreen = new EventEmitter<void>();
  @Output() emittedAttack = new EventEmitter<NexusAttackSent>();
  @Output() emittedReloadEvent = new EventEmitter<string>();
  @Output() emittedGoToCoords = new EventEmitter<[ number, number ]>();
   
  constructor(private nexusService: NexusService) { super();  }

  async engageAttackAllUnits() {
    if (!this.user || !this.originBase || !this.selectedNexus || !this.nexusAvailableUnits || !this.unitStats)
      return alert("Something went wrong with the request."); 

    this.engageAttack(true);
  }


  async engageAttack(allUnits: boolean = false) {
    if (!this.user || !this.originBase || !this.selectedNexus || !this.unitStats) return alert("Something went wrong with the request.");
    this.startLoading();
    setTimeout(() => {
      let hasUnits = false;
      if (this.user && this.originBase && this.selectedNexus && this.unitStats) {
        if (allUnits && this.nexusAvailableUnits) {
          for (let unit of this.unitStats) {
            unit.sentValue = this.nexusAvailableUnits[`${unit.unitType == "siege_tank" ? "siegeTank" : unit.unitType}Total` as keyof NexusUnits] ?? 0;
            if (!hasUnits && unit.sentValue) hasUnits = true;
          } 
        }
        if (!hasUnits && !this.unitStats.some(x => x.sentValue && x.sentValue > 0)) return alert("No units have been selected! Please select some units and try again.");

        if (this.isSendingDefence) {
          this.nexusService.defend(this.user, this.originBase, this.selectedNexus, this.unitStats).then(res => this.emittedNotifications.emit(res));
        } else {
          this.nexusService.engage(this.user, this.originBase, this.selectedNexus, this.unitStats).then(res => this.emittedNotifications.emit(res));
        }
        const nexusAttack = this.createNexusAttack();
        this.emittedAttack.emit(nexusAttack);
        this.stopLoading();
      }
    }, 10);
   
  }

  getAvailableUnitStats() { 
    return this.unitStats?.filter(unit => (this.nexusAvailableUnits?.[`${unit.unitType}Total` as keyof NexusUnits] ?? 0) > 0) || [];
  } 

  private createNexusAttack() {
    if (!this.originBase || !this.selectedNexus || !this.unitStats) return undefined;

    const unitCounts = this.unitStats.reduce((acc, unit) => {
      if (unit.sentValue) acc[unit.unitType] = unit.sentValue;
      return acc;
    }, {} as { [key: string]: number });

    this.unitStats.forEach(x => x.sentValue = 0);
    this.nexusAvailableUnits = undefined;
    return {
      originCoordsX: this.originBase.coordsX,
      originCoordsY: this.originBase.coordsY,
      originUser: this.originBase.user,
      destinationCoordsX: this.selectedNexus.coordsX,
      destinationCoordsY: this.selectedNexus.coordsY,
      destinationUser: this.selectedNexus.user,
      ...unitCounts,
      timestamp: new Date(), 
      arrived: false
    } as NexusAttackSent;
  }
  calculateAttackDuration(unitStat?: UnitStats): number {
    if (!this.originBase || !this.selectedNexus) {
      alert("Problem setting duration! Either no origin or no destination selected!")
      return 0;
    }

    const distance = 1 + Math.abs(this.originBase.coordsX - this.selectedNexus.coordsX) + Math.abs(this.originBase.coordsY - this.selectedNexus.coordsY);
    const speed = unitStat ? unitStat.speed : Math.min(...this.unitStats?.filter(unit => unit.sentValue && unit.speed)?.map(unit => unit.speed) || [0]);

    return distance * speed * 60;
  }
  isEngagingUnits() {
    return this.unitStats?.some(x => x.sentValue && x.sentValue > 0);
  }

  hasUnitsToSend() {
    return Object.keys(this.nexusAvailableUnits || {}).some(key => this.nexusAvailableUnits![key as keyof NexusUnits] > 0);
  }
  maxSliderValue(unit: UnitStats): number {
    if (unit.unitType == "marine") return this.nexusAvailableUnits?.marineTotal ?? 0;
    if (unit.unitType == "goliath") return this.nexusAvailableUnits?.goliathTotal ?? 0;
    if (unit.unitType == "siege_tank") return this.nexusAvailableUnits?.siegeTankTotal ?? 0;
    if (unit.unitType == "scout") return this.nexusAvailableUnits?.scoutTotal ?? 0;
    if (unit.unitType == "wraith") return this.nexusAvailableUnits?.wraithTotal ?? 0;
    if (unit.unitType == "battlecruiser") return this.nexusAvailableUnits?.battlecruiserTotal ?? 0;
    if (unit.unitType == "glitcher") return this.nexusAvailableUnits?.glitcherTotal ?? 0;
    return 0;
  }
  onSliderChange(event: any, unit: UnitStats): void {
    const value = Math.min(this.maxSliderValue(unit), event.target.value);
    unit.sentValue = value;
    event.target.value = value;
  }
  formatTimer(allSeconds?: number): string {
    return this.nexusService.formatTimer(allSeconds);
  }
  closeAttackScreen() {
    this.unitStats?.forEach(x => x.sentValue = undefined);
    this.emittedClosedAttackScreen.emit();
  }
  goToCoords(x: number, y: number) {
    this.emittedGoToCoords.emit([x, y]);
  }
  trackByUnit(index: number, unit: UnitStats): number {
    return unit.unitId; // or any unique identifier
  }
}
