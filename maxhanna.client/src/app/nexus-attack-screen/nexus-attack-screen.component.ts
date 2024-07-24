import { Component, Input } from '@angular/core';
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
  @Input() selectedNexus?: NexusBase;
  @Input() nexusUnits?: NexusUnits;
  @Input() unitStats?: UnitStats[];
  @Input() marinePictureSrc: string | undefined;
  @Input() goliathPictureSrc: string | undefined;
  @Input() siegeTankPictureSrc: string | undefined;
  @Input() scoutPictureSrc: string | undefined;
  @Input() wraithPictureSrc: string | undefined;
  @Input() battlecruiserPictureSrc: string | undefined;

  constructor(private nexusService: NexusService) { }

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

}
