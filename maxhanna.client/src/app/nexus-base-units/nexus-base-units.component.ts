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
  @Input() nexusAvailableUnits?: NexusUnits;
  @Input() marinePictureSrc: string | undefined;
  @Input() goliathPictureSrc: string | undefined;
  @Input() siegeTankPictureSrc: string | undefined;
  @Input() scoutPictureSrc: string | undefined;
  @Input() wraithPictureSrc: string | undefined;
  @Input() battlecruiserPictureSrc: string | undefined;
  @Input() glitcherPictureSrc: string | undefined;
  @Input() marineTitle: string | undefined;
  @Input() goliathTitle: string | undefined;
  @Input() siegeTankTitle: string | undefined;
  @Input() scoutTitle: string | undefined;
  @Input() wraithTitle: string | undefined;
  @Input() battlecruiserTitle: string | undefined;
  @Input() glitcherTitle: string | undefined;
  @Input() showOnlyMarine?: boolean = false 
  @Input() showOnlyGoliath?: boolean = false 
  @Input() showOnlySiegeTank?: boolean = false 
  @Input() showOnlyWraith?: boolean = false 
  @Input() showOnlyScout?: boolean = false 
  @Input() showOnlyBattlecruiser?: boolean = false 
  @Input() showOnlyGlitcher?: boolean = false 
  @Output() toggleUnitScreen = new EventEmitter();
  nexusHasUnits() { 
    if (!this.nexusAvailableUnits) return false;
    return (this.nexusAvailableUnits.marineTotal > 0
      || this.nexusAvailableUnits.goliathTotal > 0
      || this.nexusAvailableUnits.scoutTotal > 0
      || this.nexusAvailableUnits.wraithTotal > 0
      || this.nexusAvailableUnits.siegeTankTotal > 0
      || this.nexusAvailableUnits.battlecruiserTotal > 0
      || this.nexusAvailableUnits.glitcherTotal > 0);
  }
}
