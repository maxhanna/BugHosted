import { Component, Input } from '@angular/core';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
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
  @Input() marinePicture: FileEntry | undefined;
  @Input() goliathPicture: FileEntry | undefined;
  @Input() siegeTankPicture: FileEntry | undefined;
  @Input() scoutPicture: FileEntry | undefined;
  @Input() wraithPicture: FileEntry | undefined;
  @Input() battlecruiserPicture: FileEntry | undefined;
   
  nexusHasUnits() {
    if (!this.nexusUnits) return false;
    return (this.nexusUnits.marineTotal > 0 || this.nexusUnits.goliathTotal > 0 || this.nexusUnits.battlecruiserTotal > 0 || this.nexusUnits.wraithTotal > 0 || this.nexusUnits.siegeTankTotal > 0);
  }
}
