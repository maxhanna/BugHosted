import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NexusUnits } from '../../services/datacontracts/nexus/nexus-units';
import { AppComponent } from '../app.component';

@Component({
  selector: 'app-nexus-base-units',
  templateUrl: './nexus-base-units.component.html',
  styleUrl: './nexus-base-units.component.css'
})
export class NexusBaseUnitsComponent {

  @Input() parentRef?: AppComponent;
  @Input() nexusUnits?: NexusUnits;
  @Input() marinePictureSrc: string | undefined;
  @Input() goliathPictureSrc: string | undefined;
  @Input() siegeTankPictureSrc: string | undefined;
  @Input() scoutPictureSrc: string | undefined;
  @Input() wraithPictureSrc: string | undefined;
  @Input() battlecruiserPictureSrc: string | undefined;
  @Input() glitcherPictureSrc: string | undefined;
  @Output() toggleUnitScreen = new EventEmitter();
  nexusHasUnits() {
    if (!this.nexusUnits) return false;
    return (this.nexusUnits.marineTotal > 0
      || this.nexusUnits.goliathTotal > 0
      || this.nexusUnits.scoutTotal > 0
      || this.nexusUnits.wraithTotal > 0
      || this.nexusUnits.siegeTankTotal > 0
      || this.nexusUnits.battlecruiserTotal > 0
      || this.nexusUnits.glitcherTotal > 0);
  }
}
