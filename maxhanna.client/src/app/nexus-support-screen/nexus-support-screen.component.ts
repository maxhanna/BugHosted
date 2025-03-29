import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { NexusAttackSent } from '../../services/datacontracts/nexus/nexus-attack-sent';
import { NexusService } from '../../services/nexus.service';
import { NexusBase } from '../../services/datacontracts/nexus/nexus-base';
import { User } from '../../services/datacontracts/user/user';
import { UnitStats } from '../../services/datacontracts/nexus/unit-stats';
import { AppComponent } from '../app.component';
type GroupedDefences = {
  [key: string]: NexusAttackSent[];
};
@Component({
    selector: 'app-nexus-support-screen',
    templateUrl: './nexus-support-screen.component.html',
    styleUrl: './nexus-support-screen.component.css',
    standalone: false
})
export class NexusSupportScreenComponent implements OnInit {
  @Input() nexusDefencesIncoming?: NexusAttackSent[];
  @Input() nexusDefencesSent?: NexusAttackSent[];
  @Input() mapData?: NexusBase[] = [];
  @Input() user?: User;
  @Input() inputtedParentRef?: AppComponent;

  @Input() marinePictureSrc: string | undefined;
  @Input() goliathPictureSrc: string | undefined;
  @Input() siegeTankPictureSrc: string | undefined;
  @Input() scoutPictureSrc: string | undefined;
  @Input() wraithPictureSrc: string | undefined;
  @Input() battlecruiserPictureSrc: string | undefined;
  @Input() glitcherPictureSrc: string | undefined;
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
  getBaseNameForCoords(x?: string, y?: string) {
    if (!x || !y) return '';
    return this.mapData?.find(base => base.coordsX == parseInt(x) && base.coordsY == parseInt(y))?.baseName ?? '';
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
    const addedDefenceIds = new Set<number>();

    this.groupedDefences = defences.reduce((grouped, defence) => {
      if (addedDefenceIds.has(defence.id)) {
        return grouped; // Skip this defence if it's already been added
      }

      const key = `${defence.destinationUser?.id},${defence.destinationUser?.username}-${defence.destinationCoordsX},${defence.destinationCoordsY}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(defence);
      addedDefenceIds.add(defence.id);

      return grouped;
    }, {} as GroupedDefences);
  }
  getTmpUserForUserId(idstr?: string) {
    if (!idstr) return new User(0, "Anonymous", undefined, undefined, undefined);
    const id = parseInt(idstr.split(",")[0]);
    const username = idstr.split(",")[1];
    return new User(id, username, undefined, undefined, undefined);
  }
}
