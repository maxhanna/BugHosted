import { Component, EventEmitter, Input, OnInit, Output, output } from '@angular/core';
import { NexusBase } from '../../services/datacontracts/nexus/nexus-base';
import { NexusUnits } from '../../services/datacontracts/nexus/nexus-units';
import { UnitStats } from '../../services/datacontracts/nexus/unit-stats';
import { NexusService } from '../../services/nexus.service';
import { User } from '../../services/datacontracts/user/user';

@Component({
  selector: 'app-nexus-attack-screen',
  templateUrl: './nexus-attack-screen.component.html',
  styleUrl: './nexus-attack-screen.component.css'
})
export class NexusAttackScreenComponent {
  engagementLoading = false;

  @Input() user?: User;
  @Input() originBase?: NexusBase;
  @Input() selectedNexus?: NexusBase;
  @Input() nexusUnits?: NexusUnits;
  @Input() unitStats?: UnitStats[];
  @Input() marinePictureSrc: string | undefined;
  @Input() goliathPictureSrc: string | undefined;
  @Input() siegeTankPictureSrc: string | undefined;
  @Input() scoutPictureSrc: string | undefined;
  @Input() wraithPictureSrc: string | undefined;
  @Input() battlecruiserPictureSrc: string | undefined;
  @Input() glitcherPictureSrc: string | undefined;

  @Output() emittedNotifications = new EventEmitter<string>();
  @Output() closedAttackScreen = new EventEmitter<void>();
  @Output() emittedAttackCoordinates = new EventEmitter<NexusBase>();
  @Output() emittedReloadEvent = new EventEmitter<string>();

  constructor(private nexusService: NexusService) { }

  async engageAttackAllUnits() {
    if (!this.user || !this.originBase || !this.selectedNexus || !this.nexusUnits || !this.unitStats) return alert("Something went wrong with the request.");
    const marineTotal = this.nexusUnits.marineTotal;
    const goliathTotal = this.nexusUnits.goliathTotal;
    const siegeTankTotal = this.nexusUnits.siegeTankTotal;
    const scoutTotal = this.nexusUnits.scoutTotal;
    const wraithTotal = this.nexusUnits.wraithTotal;
    const battlecruiserTotal = this.nexusUnits.battlecruiserTotal;
    const glitcherTotal = this.nexusUnits.glitcherTotal;
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
    this.engagementLoading = true;

    const attackDuration = this.calculateAttackDuration();
    console.log("attackduration : " + attackDuration);
    if (attackDuration) {
      const res = await this.nexusService.engage(this.user, this.originBase, this.selectedNexus, this.unitStats, attackDuration);
      if (res.includes("Attack sent")) {
        this.emittedReloadEvent.emit("Attack sent");
        this.closedAttackScreen.emit();
        this.emittedAttackCoordinates.emit(this.selectedNexus);
        this.RemoveAttackingUnitsFromAvailableUnits();
      }
      this.emittedNotifications.emit(res);
    }
    this.engagementLoading = false;
  }

  async engageAttack() {
    if (!this.user || !this.originBase || !this.selectedNexus || !this.unitStats) return alert("Something went wrong with the request.");
    if (!this.unitStats.some(x => x.sentValue && x.sentValue > 0)) return alert("No units have been selected! Please select some units and try again.");
    this.engagementLoading = true;

    const attackDuration = this.calculateAttackDuration();
    console.log("attackduration : " + attackDuration);
    if (attackDuration) {
      const res = await this.nexusService.engage(this.user, this.originBase, this.selectedNexus, this.unitStats, attackDuration);
      if (res.includes("Attack sent")) {
        this.emittedReloadEvent.emit("Attack sent");
        this.closedAttackScreen.emit();
        this.emittedAttackCoordinates.emit(this.selectedNexus);
        this.RemoveAttackingUnitsFromAvailableUnits();
      }
      this.emittedNotifications.emit(res);
    }
    this.engagementLoading = false;
  }
  getAvailableUnitStats() {
    if (this.nexusUnits && this.unitStats) {
      return this.unitStats.filter(unit => {
        switch (unit.unitType) {
          case "marine":
            return this.nexusUnits!.marineTotal > 0;
          case "goliath":
            return this.nexusUnits!.goliathTotal > 0;
          case "siege_tank":
            return this.nexusUnits!.siegeTankTotal > 0;
          case "scout":
            return this.nexusUnits!.scoutTotal > 0;
          case "wraith":
            return this.nexusUnits!.wraithTotal > 0;
          case "battlecruiser":
            return this.nexusUnits!.battlecruiserTotal > 0;
          case "glitcher":
            return this.nexusUnits!.glitcherTotal > 0;
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
    if (this.nexusUnits && this.unitStats) {
      this.unitStats.forEach(unit => {
        if (unit.sentValue) {
          switch (unit.unitType) {
            case "marine":
              this.nexusUnits!.marineTotal -= unit.sentValue;
              break;
            case "goliath":
              this.nexusUnits!.goliathTotal -= unit.sentValue;
              break;
            case "siege_tank":
              this.nexusUnits!.siegeTankTotal -= unit.sentValue;
              break;
            case "scout":
              this.nexusUnits!.scoutTotal -= unit.sentValue;
              break;
            case "wraith":
              this.nexusUnits!.wraithTotal -= unit.sentValue;
              break;
            case "battlecruiser":
              this.nexusUnits!.battlecruiserTotal -= unit.sentValue;
              break;
            case "glitcher":
              this.nexusUnits!.glitcherTotal -= unit.sentValue;
              break;
          }
        }
      });
    }
  }

  calculateAttackDuration(unitStat?: UnitStats) {
    if (!this.originBase || !this.selectedNexus) {
      alert("Problem setting duration!")
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
    if (!this.nexusUnits) return false;
    return this.nexusUnits.marineTotal > 0 || this.nexusUnits.goliathTotal > 0 || this.nexusUnits.siegeTankTotal > 0
      || this.nexusUnits.scoutTotal > 0 || this.nexusUnits.wraithTotal > 0 || this.nexusUnits.battlecruiserTotal > 0 || this.nexusUnits.glitcherTotal > 0;
  }
  maxSliderValue(unit: UnitStats): number {
    if (unit.unitType == "marine") return this.nexusUnits?.marineTotal ?? 0;
    if (unit.unitType == "goliath") return this.nexusUnits?.goliathTotal ?? 0;
    if (unit.unitType == "siege_tank") return this.nexusUnits?.siegeTankTotal ?? 0;
    if (unit.unitType == "scout") return this.nexusUnits?.scoutTotal ?? 0;
    if (unit.unitType == "wraith") return this.nexusUnits?.wraithTotal ?? 0;
    if (unit.unitType == "battlecruiser") return this.nexusUnits?.battlecruiserTotal ?? 0;
    if (unit.unitType == "glitcher") return this.nexusUnits?.glitcherTotal ?? 0;
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
