import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NexusBase } from '../../services/datacontracts/nexus/nexus-base';
import { User } from '../../services/datacontracts/user/user';
import { NexusAttackSent } from '../../services/datacontracts/nexus/nexus-attack-sent';

@Component({
  selector: 'app-nexus-bases',
  templateUrl: './nexus-bases.component.html',
  styleUrl: './nexus-bases.component.css'
})
export class NexusBasesComponent {

  @Input() user: User | undefined; 
  @Input() nexusBase: NexusBase | undefined;
  @Input() mapData: NexusBase[] | undefined;
  @Input() attacksIncoming: NexusAttackSent[] | undefined;  
  @Input() attacksSent: NexusAttackSent[] | undefined;  
  @Output() emittedNotifications = new EventEmitter<string>();
  @Output() emittedBaseChange = new EventEmitter<NexusBase>();
  attacksMap: { [key: string]: NexusAttackSent[] } = {};

  getCurrentBases() {
    if (this.mapData && this.nexusBase) {
      return this.mapData.filter(x => x.user?.id == this.user?.id);
    } else return [];
  }
  selectBase(nexusBase: NexusBase) {
    console.log(nexusBase);
    this.emittedBaseChange.emit(nexusBase);
  }
   
  getAttacksForBase(coordsX: number, coordsY: number): NexusAttackSent[] {
    if (this.attacksIncoming && this.attacksSent && !this.attacksMap) {
      this.attacksMap = {};
      for (let attack of this.attacksIncoming) {
        const key = `${attack.destinationCoordsX},${attack.destinationCoordsY}`;
        if (!this.attacksMap[key]) {
          this.attacksMap[key] = [];
        } 
        this.attacksMap[key].push(attack);
      }
      for (let attack of this.attacksSent) {
        const key = `${attack.destinationCoordsX},${attack.destinationCoordsY}`;
        if (!this.attacksMap[key]) {
          this.attacksMap[key] = [];
        }
        this.attacksMap[key].push(attack);
      }
    }
    const key = `${coordsX},${coordsY}`;
    return this.attacksMap[key] || [];
  }
}
