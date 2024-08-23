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
  unitTypes = [
    { code: 'marineTotal', shortName: 'M' },
    { code: 'goliathTotal', shortName: 'G' },
    { code: 'siegeTankTotal', shortName: 'ST' },
    { code: 'scoutTotal', shortName: 'S' },
    { code: 'wraithTotal', shortName: 'W' },
    { code: 'battlecruiserTotal', shortName: 'B' },
    { code: 'glitcherTotal', shortName: 'GL' }
  ]; 
  commands = [
    "Upgrade Command Center", "Upgrade Mines", "Upgrade Supply Depot", "Upgrade Warehouse",
    "Upgrade Engineering Bay", "Upgrade Factory", "Upgrade Starport",
    "Build Marines", "Build Goliath", "Build Siege Tanks", "Build Scouts",
    "Build Wraith", "Build Battlecruisers", "Build Glitcher"
  ];

  getCurrentBases() { 
    if (this.mapData && this.nexusBase) { 
      const data = this.mapData
        .filter(x => x.user?.id === this.user?.id);
      data.sort((a, b) => {
        if (this.attacksIncoming) { 
          const aHasIncomingAttacks = this.attacksIncoming.some(attack =>
            attack.destinationCoordsX != attack.originCoordsX && attack.destinationCoordsY != attack.originCoordsY &&
            attack.destinationCoordsX == a.coordsX && attack.destinationCoordsY == a.coordsY
          );
          const bHasIncomingAttacks = this.attacksIncoming.some(attack =>
            attack.destinationCoordsX != attack.originCoordsX && attack.destinationCoordsY != attack.originCoordsY &&
            attack.destinationCoordsX == b.coordsX && attack.destinationCoordsY == b.coordsY
          );

          if (aHasIncomingAttacks && !bHasIncomingAttacks) return -1;
          if (!aHasIncomingAttacks && bHasIncomingAttacks) return 1;
        }  

        return 0;
      });
      return data;
    } else { 
      return [];
    }
  }

  selectBase(nexusBase: NexusBase) { 
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
      this.emittedUpgrade.emit([res as NexusBase[], this.commandSelector.nativeElement.value ?? ""]);
    }
    this.commandSelector.nativeElement.selectedIndex = 0;
  }

  trackByCoords(index: number, base: any): string {
    return `${base.coordsX}-${base.coordsY}`;
  }

  getBaseClass(base: any): string {
    return `borderUnderline smallFont ${this.isHighlightedBase(base) ? 'highlightedBase' : ''}`;
  }

  getAttackClass(base: any): string {
    return this.getAttacksCount(base) > 0 ? 'redText' : 'greyText';
  }

  getUnitClass(base: any, unitCode: string): string {
    if (this.isValidUnitCode(unitCode)) {
      const hasUnits = this.getUnitTotal(base, unitCode as keyof NexusUnits) > 0;
      return `baseUnitCountSpan ${hasUnits ? 'gameNotification' : 'greyText'}`;
    }
    return 'baseUnitCountSpan greyText';
  }

  private isValidUnitCode(code: string): code is keyof NexusUnits {
    return ['marineTotal', 'goliathTotal', 'siegeTankTotal', 'scoutTotal', 'wraithTotal', 'battlecruiserTotal', 'glitcherTotal'].includes(code);
  }

  getAttacksCount(base: any): number {
    return this.getAttacksForBase(base.coordsX, base.coordsY).length;
  }
  getUnitTotalSafe(base: any, unitCode: string): number {
    return this.isValidUnitCode(unitCode) ? this.getUnitTotal(base, unitCode as keyof NexusUnits) : 0;
  }
  getUnitTotal(base: any, unitCode: keyof NexusUnits): number {
    const units: NexusUnits | undefined = this.getUnitsForBase(base.coordsX, base.coordsY);
    return units ? units[unitCode] : 0;
  }

  isHighlightedBase(base: any): boolean {
    return (this.nexusBase && base.coordsX === this.nexusBase.coordsX && base.coordsY === this.nexusBase.coordsY) ? true : false;
  }
}
