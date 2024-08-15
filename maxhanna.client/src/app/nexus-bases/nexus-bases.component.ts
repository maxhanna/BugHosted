import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { NexusBase } from '../../services/datacontracts/nexus/nexus-base';
import { User } from '../../services/datacontracts/user/user';
import { NexusAttackSent } from '../../services/datacontracts/nexus/nexus-attack-sent';
import { NexusUnits } from '../../services/datacontracts/nexus/nexus-units';
import { NexusService } from '../../services/nexus.service';
import { ChildComponent } from '../child.component';

@Component({
  selector: 'app-nexus-bases',
  templateUrl: './nexus-bases.component.html',
  styleUrl: './nexus-bases.component.css'
})
export class NexusBasesComponent extends ChildComponent {
  constructor(private nexusService: NexusService) { super(); }
  @Input() user: User | undefined; 
  @Input() nexusBase: NexusBase | undefined;
  @Input() allNexusUnits: NexusUnits[] | undefined;
  @Input() mapData: NexusBase[] | undefined;
  @Input() attacksIncoming: NexusAttackSent[] | undefined;   
  @Output() emittedNotifications = new EventEmitter<string>();
  @Output() emittedBaseChange = new EventEmitter<NexusBase>();
  @Output() emittedUpgrade = new EventEmitter<[NexusBase[], string]>();

  @ViewChild('commandSelector') commandSelector!: ElementRef<HTMLSelectElement>;

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
  async selectCommand() {
    if (!confirm(`Command all bases to ${this.commandSelector.nativeElement.value}?`)) return;

    let res: NexusBase[] = [];
    switch (this.commandSelector.nativeElement.value) {
      case 'Upgrade Command Center':
        res = await this.nexusService.upgradeAll("command_center", this.user); 
        break;
      case 'Upgrade Mines':
        res = await this.nexusService.upgradeAll("mines", this.user);
        break;
      case 'Upgrade Supply Depot':
        res = await this.nexusService.upgradeAll("supply_depot", this.user);
        break;
      case 'Upgrade Warehouse':
        res = await this.nexusService.upgradeAll("warehouse", this.user);
        break;
      case 'Upgrade Engineering Bay':
        res = await this.nexusService.upgradeAll("engineering_bay", this.user);
        break;
      case 'Upgrade Factory':
        res = await this.nexusService.upgradeAll("factory", this.user);
        break;
      case 'Upgrade Starport':
        res = await this.nexusService.upgradeAll("starport", this.user);
        break;
      case 'Build Marines':
        res = await this.nexusService.massPurchase("marine", this.user);
        break;
      case 'Build Goliath':
        res = await this.nexusService.massPurchase("goliath", this.user);
        break;
      case 'Build Siege Tanks':
        res = await this.nexusService.massPurchase("siege_tank", this.user);
        break;
      case 'Build Scouts':
        res = await this.nexusService.massPurchase("scout", this.user);
        break;
      case 'Build Wraith':
        res = await this.nexusService.massPurchase("wraith", this.user);
        break;
      case 'Build Battlecruisers':
        res = await this.nexusService.massPurchase("battlecruiser", this.user);
        break;
      case 'Build Glitcher':
        res = await this.nexusService.massPurchase("glitcher", this.user);
        break;
      default:
        console.log('Unknown command');
    }
    if (res) {
      console.log(res);
      this.emittedUpgrade.emit([res as NexusBase[], this.commandSelector.nativeElement.value ?? ""]);
    }
    this.commandSelector.nativeElement.selectedIndex = 0;
  }
}
