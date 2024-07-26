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

  @Output() emittedNotifications = new EventEmitter<string>();
  @Output() closedAttackScreen = new EventEmitter<void>();
  @Output() emittedAttackCoordinates = new EventEmitter<NexusBase>();
  @Output() emittedReloadEvent = new EventEmitter<string>();

  constructor(private nexusService: NexusService) { } 

  async engageAttack() {
    if (!this.user || !this.originBase || !this.selectedNexus || !this.unitStats) return alert("Something went wrong with the request.");
    if (!this.unitStats.some(x => x.sentValue && x.sentValue > 0)) return alert("No units have been selected! Please select some units and try again.");
    const attackDuration = this.calculateAttackDuration();
    console.log("attackduration : " + attackDuration);
    if (attackDuration) {
      const res = await this.nexusService.engage(this.user, this.originBase, this.selectedNexus, this.unitStats, attackDuration); 
      if (res.includes("Attack sent")) {
        this.emittedReloadEvent.emit("Attack sent");
        this.closedAttackScreen.emit();
        this.emittedAttackCoordinates.emit(this.selectedNexus); 
      }
      this.emittedNotifications.emit(res);
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
      let slowestSpeed = Infinity;

      if (this.unitStats) {
        for (const unit of this.unitStats) {
          if (unit.sentValue && unit.sentValue > 0 && unit.speed && unit.speed < slowestSpeed) {
            slowestSpeed = unit.speed;
          }
        }
      }
       
      if (slowestSpeed === Infinity) {
        slowestSpeed = 0; // or handle as needed
      } 
      return distance * slowestSpeed * 60;
    }
    
  }
  isEngagingUnits() {
    if (!this.unitStats) return false;
    return this.unitStats.filter(x => x.sentValue && x.sentValue > 0);
  }
  maxSliderValue(unit: UnitStats): number {
    if (unit.unitType == "marine") return this.nexusUnits?.marineTotal ?? 0;
    if (unit.unitType == "goliath") return this.nexusUnits?.goliathTotal ?? 0;
    if (unit.unitType == "siege_tank") return this.nexusUnits?.siegeTankTotal ?? 0;
    if (unit.unitType == "scout") return this.nexusUnits?.scoutTotal ?? 0;
    if (unit.unitType == "wraith") return this.nexusUnits?.wraithTotal ?? 0;
    if (unit.unitType == "battlecruiser") return this.nexusUnits?.battlecruiserTotal ?? 0;
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
