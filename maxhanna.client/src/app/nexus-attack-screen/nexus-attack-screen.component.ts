import { Component, EventEmitter, Input, OnInit, Output, output } from '@angular/core';
import { NexusBase } from '../../services/datacontracts/nexus/nexus-base';
import { NexusUnits } from '../../services/datacontracts/nexus/nexus-units';
import { UnitStats } from '../../services/datacontracts/nexus/unit-stats';
import { NexusService } from '../../services/nexus.service';

@Component({
  selector: 'app-nexus-attack-screen',
  templateUrl: './nexus-attack-screen.component.html',
  styleUrl: './nexus-attack-screen.component.css'
})
export class NexusAttackScreenComponent {
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

  @Output() closedAttackScreen = new EventEmitter<void>();


  constructor(private nexusService: NexusService) { } 

  engageAttack() {
    const attackDuration = this.calculateAttackDuration();
    alert(this.formatTimer(attackDuration));
  }

  calculateAttackDuration(unitStat?: UnitStats) {
    if (!this.originBase || !this.selectedNexus) return 0;
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
      this.unitStats?.forEach(x => {
        if (x.sentValue && x.sentValue > 0 && x.speed && (!slowestSpeed || slowestSpeed < x.speed)) {
          slowestSpeed = x.speed; 
        }
      });
      return distance * slowestSpeed * 60;
    }
    
  }
  isEngagingUnits() {
    if (!this.unitStats) return false;
    return this.unitStats.find(x => x.sentValue && x.sentValue > 0);
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
    unit.sentValue = parseInt(event.target.value);
  }
  formatTimer(allSeconds?: number): string {
    return this.nexusService.formatTimer(allSeconds);
  }
  closeAttackScreen() {
    this.unitStats?.forEach(x => x.sentValue = undefined);
    this.closedAttackScreen.emit();
  }
}
