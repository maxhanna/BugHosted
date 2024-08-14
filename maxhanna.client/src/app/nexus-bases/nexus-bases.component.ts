import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NexusBase } from '../../services/datacontracts/nexus/nexus-base';
import { User } from '../../services/datacontracts/user/user';
import { NexusAttackSent } from '../../services/datacontracts/nexus/nexus-attack-sent';
import { NexusUnits } from '../../services/datacontracts/nexus/nexus-units';

@Component({
  selector: 'app-nexus-bases',
  templateUrl: './nexus-bases.component.html',
  styleUrl: './nexus-bases.component.css'
})
export class NexusBasesComponent {

  @Input() user: User | undefined; 
  @Input() nexusBase: NexusBase | undefined;
  @Input() allNexusUnits: NexusUnits[] | undefined;
  @Input() mapData: NexusBase[] | undefined;
  @Input() attacksIncoming: NexusAttackSent[] | undefined;   
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
    if (this.attacksIncoming && this.attacksMap && Object.keys(this.attacksMap).length == 0) {
      this.attacksMap = {};
      const pertinentAttacks = this.attacksIncoming.filter(x => x.destinationUser?.id == this.user?.id && x.originUser?.id != this.user?.id);
      for (let attack of pertinentAttacks) {
        const key = `${attack.destinationCoordsX},${attack.destinationCoordsY}`;
        if (!this.attacksMap[key]) {
          this.attacksMap[key] = [];
        }
        this.attacksMap[key].push(attack);
      }

    }
    const key = `${coordsX},${coordsY}`;
    //console.log(this.attacksMap[key]);
    return this.attacksMap[key] || [];
  }
  getUnitsForBase(coordsX: number, coordsY: number) {
    return this.allNexusUnits?.find(x => x.coordsX == coordsX && x.coordsY == coordsY) ?? undefined;
  }
}
