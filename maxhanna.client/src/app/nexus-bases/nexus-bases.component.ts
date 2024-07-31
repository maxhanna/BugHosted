import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NexusBase } from '../../services/datacontracts/nexus/nexus-base';
import { User } from '../../services/datacontracts/user/user';

@Component({
  selector: 'app-nexus-bases',
  templateUrl: './nexus-bases.component.html',
  styleUrl: './nexus-bases.component.css'
})
export class NexusBasesComponent {

  @Input() user: User | undefined; 
  @Input() nexusBase: NexusBase | undefined; 
  @Input() mapData: NexusBase[] | undefined; 
  @Output() emittedNotifications = new EventEmitter<string>();
  @Output() emittedBaseChange = new EventEmitter<NexusBase>();

  getCurrentBases() {
    if (this.mapData && this.nexusBase) {
      return this.mapData.filter(x => x.user?.id == this.user?.id);
    } else return [];
  }
  selectBase(nexusBase: NexusBase) {
    console.log(nexusBase);
    this.emittedBaseChange.emit(nexusBase);
  }
}
