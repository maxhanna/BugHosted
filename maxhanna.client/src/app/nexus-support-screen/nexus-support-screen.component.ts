import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { NexusAttackSent } from '../../services/datacontracts/nexus/nexus-attack-sent';
import { NexusService } from '../../services/nexus.service';
import { NexusBase } from '../../services/datacontracts/nexus/nexus-base';
import { User } from '../../services/datacontracts/user/user';
import { UnitStats } from '../../services/datacontracts/nexus/unit-stats';
type GroupedDefences = {
  [key: string]: NexusAttackSent[];
};
@Component({
  selector: 'app-nexus-support-screen',
  templateUrl: './nexus-support-screen.component.html',
  styleUrl: './nexus-support-screen.component.css'
})
export class NexusSupportScreenComponent implements OnInit {
  @Input() nexusDefencesIncoming?: NexusAttackSent[];
  @Input() nexusDefencesSent?: NexusAttackSent[];
  @Input() user?: User; 
  @Output() defenceReturnedEmitter = new EventEmitter<NexusAttackSent>;
  @Output() openMapEmitter = new EventEmitter<string>;
  groupedDefences: GroupedDefences = {};
  constructor(private nexusService: NexusService) { }


  ngOnInit() {
    this.groupDefencesByBase();
  }
  getObjectKeys(obj: any): string[] {
    return Object.keys(obj);
  }

  async sendBack(nexusAttack: NexusAttackSent) {
    if (!this.user) return;
    if (!nexusAttack.arrived) { return alert("Please wait until the support has arrived before sending it back."); }
    this.nexusService.returnDefence(this.user, nexusAttack.id);
     
    nexusAttack.arrived = false;
    nexusAttack.destinationCoordsX = nexusAttack.originCoordsX;
    nexusAttack.destinationCoordsY = nexusAttack.originCoordsY;
    nexusAttack.timestamp = new Date();
    this.defenceReturnedEmitter.emit(nexusAttack);
  }

  groupDefencesByBase() {
    const defences = [...this.nexusDefencesIncoming ?? [], ...this.nexusDefencesSent ?? []];

    this.groupedDefences = defences.reduce((grouped, defence) => {
      const key = `${defence.destinationUserId}-${defence.destinationCoordsX},${defence.destinationCoordsY}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(defence);
      return grouped;
    }, {} as GroupedDefences);
  }
}
