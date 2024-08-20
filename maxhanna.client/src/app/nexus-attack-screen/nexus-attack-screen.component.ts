import { Component, EventEmitter, Input, OnInit, Output, output } from '@angular/core';
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
  @Output() closedAttackScreen = new EventEmitter<void>();
  @Output() emittedAttack = new EventEmitter<NexusAttackSent>();
  @Output() emittedReloadEvent = new EventEmitter<string>();

  constructor(private nexusService: NexusService) { super();  }

  async engageAttackAllUnits() {
    if (!this.user || !this.originBase || !this.selectedNexus || !this.nexusAvailableUnits || !this.unitStats) return alert("Something went wrong with the request.");
    const marineTotal = this.nexusAvailableUnits.marineTotal;
    const goliathTotal = this.nexusAvailableUnits.goliathTotal;
    const siegeTankTotal = this.nexusAvailableUnits.siegeTankTotal;
    const scoutTotal = this.nexusAvailableUnits.scoutTotal;
    const wraithTotal = this.nexusAvailableUnits.wraithTotal;
    const battlecruiserTotal = this.nexusAvailableUnits.battlecruiserTotal;
    const glitcherTotal = this.nexusAvailableUnits.glitcherTotal;
     this.unitStats.forEach(x => {
      if (x.unitType == "marine") {
        x.sentValue = marineTotal;
      } else if (x.unitType == "goliath") {
        x.sentValue = goliathTotal;
      } else if (x.unitType == "siege_tank") {
        x.sentValue = siegeTankTotal;
      } else if (x.unitType == "scout") {
        x.sentValue = scoutTotal;
      } else if (x.unitType == "wraith") {
        x.sentValue = wraithTotal;
      } else if (x.unitType == "battlecruiser") {
        x.sentValue = battlecruiserTotal
      } else if (x.unitType == "glitcher") {
        x.sentValue = glitcherTotal
      }  
    });
    if (!this.unitStats.some(x => x.sentValue && x.sentValue > 0)) return alert("No units!"); 

    await this.engageAttack();
  }

  async engageAttack() {
    if (!this.user || !this.originBase || !this.selectedNexus || !this.unitStats) return alert("Something went wrong with the request.");
    if (!this.unitStats.some(x => x.sentValue && x.sentValue > 0)) return alert("No units have been selected! Please select some units and try again.");
    this.startLoading();

    const attackDuration = this.calculateAttackDuration();
    if (attackDuration) {
      if (this.isSendingDefence) {
        this.nexusService.defend(this.user, this.originBase, this.selectedNexus, this.unitStats, attackDuration); 
      } else { 
        this.nexusService.engage(this.user, this.originBase, this.selectedNexus, this.unitStats, attackDuration);
      }
       
      //this.emittedReloadEvent.emit("Attack sent");
      //this.closedAttackScreen.emit();
      this.RemoveAttackingUnitsFromAvailableUnits();
      const nexusAttack = this.createNexusAttack(attackDuration);
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
      this.unitStats.forEach(unit => {
        if (unit.sentValue) {
          switch (unit.unitType) {
            case "marine":
              this.nexusAvailableUnits!.marineTotal -= unit.sentValue;
              this.nexusUnitsOutsideOfBase!.marineTotal += unit.sentValue;
              break;
            case "goliath":
              this.nexusAvailableUnits!.goliathTotal -= unit.sentValue;
              this.nexusUnitsOutsideOfBase!.goliathTotal += unit.sentValue;
              break;
            case "siege_tank":
              this.nexusAvailableUnits!.siegeTankTotal -= unit.sentValue;
              this.nexusUnitsOutsideOfBase!.siegeTankTotal += unit.sentValue;
              break;
            case "scout":
              this.nexusAvailableUnits!.scoutTotal -= unit.sentValue;
              this.nexusUnitsOutsideOfBase!.scoutTotal += unit.sentValue;
              break;
            case "wraith":
              this.nexusAvailableUnits!.wraithTotal -= unit.sentValue;
              this.nexusUnitsOutsideOfBase!.wraithTotal += unit.sentValue;
              break;
            case "battlecruiser":
              this.nexusAvailableUnits!.battlecruiserTotal -= unit.sentValue;
              this.nexusUnitsOutsideOfBase!.battlecruiserTotal += unit.sentValue;
              break;
            case "glitcher":
              this.nexusAvailableUnits!.glitcherTotal -= unit.sentValue;
              this.nexusUnitsOutsideOfBase!.glitcherTotal += unit.sentValue;
              break;
          }
        }
      });
    }
  }

  private createNexusAttack(duration: number) {
    if (this.nexusAvailableUnits && this.unitStats && this.originBase && this.selectedNexus) {
      let marineCount = 0;
      let goliathCount = 0;
      let siegeTankCount = 0;
      let scoutCount = 0;
      let wraithCount = 0;
      let battlecruiserCount = 0;
      let glitcherCount = 0;

      this.unitStats.forEach(unit => {
        if (unit.sentValue) {
          switch (unit.unitType) {
            case "marine":
              marineCount = unit.sentValue;
              break;
            case "goliath":
              goliathCount = unit.sentValue;
              break;
            case "siege_tank":
              siegeTankCount = unit.sentValue;
              break;
            case "scout":
              scoutCount = unit.sentValue;
              break;
            case "wraith":
              wraithCount = unit.sentValue;
              break;
            case "battlecruiser":
              battlecruiserCount = unit.sentValue;
              break;
            case "glitcher":
              glitcherCount = unit.sentValue;
              break;
          }
        }
      });
      return {
        originCoordsX: this.originBase.coordsX,
        originCoordsY: this.originBase.coordsY,
        originUser: this.originBase.user,
        destinationCoordsX: this.selectedNexus.coordsX,
        destinationCoordsY: this.selectedNexus.coordsY,
        destinationUser: this.selectedNexus.user,
        marineTotal: marineCount,
        goliathTotal: goliathCount,
        siegeTankTotal: siegeTankCount,
        scoutTotal: scoutCount,
        wraithTotal: wraithCount,
        battlecruiserTotal: battlecruiserCount,
        glitcherTotal: glitcherCount,
        timestamp: new Date(),
        duration: duration,
        arrived: false
      } as NexusAttackSent;
    }
    return undefined;
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
    this.closedAttackScreen.emit();
  }
}
