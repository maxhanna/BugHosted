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
   
  constructor(private nexusService: NexusService) { super();  }

  async engageAttackAllUnits() {
    if (!this.user || !this.originBase || !this.selectedNexus || !this.nexusAvailableUnits || !this.unitStats)
      return alert("Something went wrong with the request.");

    const unitTypeMap: any = {
      marine: this.nexusAvailableUnits.marineTotal,
      goliath: this.nexusAvailableUnits.goliathTotal,
      siege_tank: this.nexusAvailableUnits.siegeTankTotal,
      scout: this.nexusAvailableUnits.scoutTotal,
      wraith: this.nexusAvailableUnits.wraithTotal,
      battlecruiser: this.nexusAvailableUnits.battlecruiserTotal,
      glitcher: this.nexusAvailableUnits.glitcherTotal
    };

    this.unitStats.forEach(unit => {
      unit.sentValue = unitTypeMap[unit.unitType] ?? 0;
    });

    if (!this.unitStats.some(x => x.sentValue && x.sentValue > 0))
      return alert("No units!");

    this.engageAttack();
  }


  async engageAttack() {
    if (!this.user || !this.originBase || !this.selectedNexus || !this.unitStats) return alert("Something went wrong with the request.");
    if (!this.unitStats.some(x => x.sentValue && x.sentValue > 0)) return alert("No units have been selected! Please select some units and try again.");
    this.startLoading();

    const attackDuration = this.calculateAttackDuration();
    if (attackDuration) {
      if (this.isSendingDefence) {
        this.nexusService.defend(this.user, this.originBase, this.selectedNexus, this.unitStats, attackDuration).then(res => this.emittedNotifications.emit(res));
      } else {
        this.nexusService.engage(this.user, this.originBase, this.selectedNexus, this.unitStats, attackDuration).then(res => this.emittedNotifications.emit(res));
      }
        
      this.RemoveAttackingUnitsFromAvailableUnits();
      const nexusAttack = this.createNexusAttack(attackDuration);
      this.unitStats.forEach(x => x.sentValue = 0);
      this.emittedAttack.emit(nexusAttack);
      this.emittedNotifications.emit(`Sending ${this.isSendingDefence ? 'Defence' : 'Attack'} ${this.isSendingDefence ? 'to' : 'on'} {${this.selectedNexus.coordsX},${this.selectedNexus.coordsY}}`); 
    }
    this.stopLoading();
  }
  getAvailableUnitStats() {
    if (this.nexusAvailableUnits && this.unitStats) {
      return this.unitStats.filter(unit => {
        switch (unit.unitType) {
          case "marine":
            return this.nexusAvailableUnits!.marineTotal > 0;
          case "goliath":
            return this.nexusAvailableUnits!.goliathTotal > 0;
          case "siege_tank":
            return this.nexusAvailableUnits!.siegeTankTotal > 0;
          case "scout":
            return this.nexusAvailableUnits!.scoutTotal > 0;
          case "wraith":
            return this.nexusAvailableUnits!.wraithTotal > 0;
          case "battlecruiser":
            return this.nexusAvailableUnits!.battlecruiserTotal > 0;
          case "glitcher":
            return this.nexusAvailableUnits!.glitcherTotal > 0;
          default:
            return false;
        }
      });
    }
    else {
      return [];
    } 
  }
  private RemoveAttackingUnitsFromAvailableUnits() {
    if (this.nexusAvailableUnits && this.unitStats && this.originBase) {
      if (!this.nexusUnitsOutsideOfBase) {
        this.nexusUnitsOutsideOfBase = {
          coordsX: this.originBase.coordsX,
          coordsY: this.originBase.coordsY,
          marineTotal: 0,
          goliathTotal: 0,
          siegeTankTotal: 0,
          scoutTotal: 0,
          wraithTotal: 0,
          battlecruiserTotal: 0,
          glitcherTotal: 0
        } as NexusUnits;
      }

      const unitTypeMap: any = {
        marine: 'marineTotal',
        goliath: 'goliathTotal',
        siege_tank: 'siegeTankTotal',
        scout: 'scoutTotal',
        wraith: 'wraithTotal',
        battlecruiser: 'battlecruiserTotal',
        glitcher: 'glitcherTotal'
      };

      this.unitStats.forEach(unit => {
        if (unit.sentValue) {
          const unitType = unitTypeMap[unit.unitType];
          if (unitType) {
            if (this.nexusAvailableUnits) {
              this.nexusAvailableUnits[unitType as keyof NexusUnits] -= unit.sentValue; 
            }
            if (!this.nexusUnitsOutsideOfBase) { this.nexusUnitsOutsideOfBase = {} as NexusUnits; }
            this.nexusUnitsOutsideOfBase[unitType as keyof NexusUnits] += unit.sentValue;
          }
        }
      });
    } 
  }

  private createNexusAttack(duration: number) {
    if (!this.nexusAvailableUnits || !this.unitStats || !this.originBase || !this.selectedNexus) {
      return undefined;
    }
     
    const unitCounts: { [key: string]: number } = {
      marine: 0,
      goliath: 0,
      siege_tank: 0,
      scout: 0,
      wraith: 0,
      battlecruiser: 0,
      glitcher: 0
    };

    for (const unit of this.unitStats) {
      if (unit.sentValue) {
        unitCounts[unit.unitType] = unit.sentValue;
      }
    }

    const { coordsX: originCoordsX, coordsY: originCoordsY, user: originUser } = this.originBase;
    const { coordsX: destinationCoordsX, coordsY: destinationCoordsY, user: destinationUser } = this.selectedNexus;

    return {
      originCoordsX,
      originCoordsY,
      originUser,
      destinationCoordsX,
      destinationCoordsY,
      destinationUser,
      marineTotal: unitCounts["marine"],
      goliathTotal: unitCounts["goliath"],
      siegeTankTotal: unitCounts["siege_tank"],
      scoutTotal: unitCounts["scout"],
      wraithTotal: unitCounts["wraith"],
      battlecruiserTotal: unitCounts["battlecruiser"],
      glitcherTotal: unitCounts["glitcher"],
      timestamp: new Date(),
      duration: duration,
      arrived: false
    } as NexusAttackSent; 
  }


  calculateAttackDuration(unitStat?: UnitStats) {
    if (!this.originBase || !this.selectedNexus) {
      alert("Problem setting duration! Either no origin or no destination selected!")
      return 0;
    }
    const selectedX = this.selectedNexus.coordsX;
    const selectedY = this.selectedNexus.coordsY;
    const baseX = this.originBase.coordsX;
    const baseY = this.originBase.coordsY;
    const distance = 1 + (Math.abs(baseX - selectedX) + Math.abs(baseY - selectedY));

    if (unitStat) {
      const unitSpeed = unitStat.speed;
      return distance * unitSpeed * 60;
    } else {
      let slowestSpeed = 0;

      if (this.unitStats) {
        for (const unit of this.unitStats) {
          if (unit.sentValue && unit.sentValue > 0 && unit.speed && unit.speed > slowestSpeed) {
            slowestSpeed = unit.speed;
          }
        }
      }

      return distance * slowestSpeed * 60;
    }

  }
  isEngagingUnits() {
    if (!this.unitStats) return false;
    return this.unitStats.find(x => x.sentValue && x.sentValue > 0);
  }
  hasUnitsToSend() {
    if (!this.nexusAvailableUnits) return false;
    return this.nexusAvailableUnits.marineTotal > 0 || this.nexusAvailableUnits.goliathTotal > 0 || this.nexusAvailableUnits.siegeTankTotal > 0
      || this.nexusAvailableUnits.scoutTotal > 0 || this.nexusAvailableUnits.wraithTotal > 0 || this.nexusAvailableUnits.battlecruiserTotal > 0 || this.nexusAvailableUnits.glitcherTotal > 0;
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
  trackByUnit(index: number, unit: UnitStats): number {
    return unit.unitId; // or any unique identifier
  }
}
