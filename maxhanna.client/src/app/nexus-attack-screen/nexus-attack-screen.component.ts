import { Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild, output } from '@angular/core';
import { NexusBase } from '../../services/datacontracts/nexus/nexus-base';
import { NexusUnits } from '../../services/datacontracts/nexus/nexus-units';
import { UnitStats } from '../../services/datacontracts/nexus/unit-stats';
import { NexusService } from '../../services/nexus.service';
import { User } from '../../services/datacontracts/user/user';
import { ChildComponent } from '../child.component';
import { NexusAttackSent } from '../../services/datacontracts/nexus/nexus-attack-sent';
import { NotificationService } from '../../services/notification.service';


@Component({
    selector: 'app-nexus-attack-screen',
    templateUrl: './nexus-attack-screen.component.html',
    styleUrl: './nexus-attack-screen.component.css',
    standalone: false
})
export class NexusAttackScreenComponent extends ChildComponent {
  @Input() user?: User;
  @Input() originBase?: NexusBase;
  @Input() selectedNexus?: NexusBase;
  @Input() nexusAvailableUnits?: NexusUnits;
  @Input() nexusUnitsOutsideOfBase?: NexusUnits;
  @Input() unitStats?: UnitStats[];
  @Input() marinePictureSrc: string | undefined;
  @Input() goliathPictureSrc: string | undefined;
  @Input() siegeTankPictureSrc: string | undefined;
  @Input() scoutPictureSrc: string | undefined;
  @Input() wraithPictureSrc: string | undefined;
  @Input() battlecruiserPictureSrc: string | undefined;
  @Input() glitcherPictureSrc: string | undefined;
  @Input() isSendingDefence: boolean = false;
  @Input() isLoadingData: boolean = false;

  @Output() emittedNotifications = new EventEmitter<string>();
  @Output() emittedClosedAttackScreen = new EventEmitter<void>();
  @Output() emittedAttack = new EventEmitter<NexusAttackSent>();
  @Output() emittedReloadEvent = new EventEmitter<string>();
  @Output() emittedGoToCoords = new EventEmitter<[number, number]>();

  constructor(private nexusService: NexusService, private notificationService: NotificationService) { super(); }

  async engageAttackAllUnits() {
    if (!this.user || !this.originBase) { 
      this.parentRef?.showNotification("Something went wrong with the request.");
      return;
    } else if (!this.selectedNexus || !this.nexusAvailableUnits || !this.unitStats) {
      this.parentRef?.showNotification("No units to send.");
      return;
    }

    this.engageAttack(true);
  }


  async engageAttack(allUnits: boolean = false) {
    if (!this.user || !this.originBase) {
      this.parentRef?.showNotification("Something went wrong with the request.");
      return;
    } else if (!this.selectedNexus || !this.nexusAvailableUnits || !this.unitStats) {
      this.parentRef?.showNotification("No units to send.");
      return;
    }

    this.startLoading();
    setTimeout(() => {
      let hasUnits = false;
      if (this.user && this.originBase && this.selectedNexus && this.unitStats) {
        if (allUnits && this.nexusAvailableUnits) {
          for (let unit of this.unitStats) {
            unit.sentValue = this.nexusAvailableUnits[`${unit.unitType == "siege_tank" ? "siegeTank" : unit.unitType}Total` as keyof NexusUnits] ?? 0;
            if (!hasUnits && unit.sentValue) hasUnits = true;
          }
        }
        if (!hasUnits && !this.unitStats.some(x => x.sentValue && x.sentValue > 0)) {
          this.parentRef?.showNotification("No units have been selected! Please select some units and try again.");
          return;
        } 

        if (this.isSendingDefence) {
          this.nexusService.defend(this.user, this.originBase, this.selectedNexus, this.unitStats).then(res => this.emittedNotifications.emit(res));
        } else {
          this.nexusService.engage(this.user, this.originBase, this.selectedNexus, this.unitStats).then(res => this.emittedNotifications.emit(res));
          if (this.user.id != this.selectedNexus.user?.id && this.selectedNexus.user) {
            this.notificationService.createNotifications({ fromUser: this.user, toUser: [this.selectedNexus.user], message: `BugWars attack incoming on {${this.selectedNexus.coordsX},${this.selectedNexus.coordsY}}` });
          }
        }
        const nexusAttack = this.createNexusAttack();
        this.emittedAttack.emit(nexusAttack);
        this.stopLoading();
      }
    }, 10);

  }

  getAvailableUnitStats() { 
    if (!this.unitStats || !this.nexusAvailableUnits) return [];

    const availableUnitStats: UnitStats[] = [];
    const availableUnits = this.nexusAvailableUnits;

    for (let i = 0; i < this.unitStats.length; i++) {
      const unit = this.unitStats[i];
      const unitType = unit.unitType == 'siege_tank' ? 'siegeTank' : unit.unitType;
      const totalUnits = availableUnits[`${unitType}Total` as keyof NexusUnits] ?? 0;

      if (totalUnits > 0) {
        availableUnitStats.push(unit);
      }
    } 

    return availableUnitStats;
  }


  private createNexusAttack() {
    if (!this.originBase || !this.selectedNexus || !this.unitStats) return undefined;

    const unitCounts: { [key: string]: number } = {};
    for (let i = 0; i < this.unitStats.length; i++) {
      const unit = this.unitStats[i];
      if (unit.sentValue) {
        unitCounts[unit.unitType] = unit.sentValue;
      }
    }

    for (let i = 0; i < this.unitStats.length; i++) {
      this.unitStats[i].sentValue = 0;
    }

    this.nexusAvailableUnits = undefined;
    return {
      originCoordsX: this.originBase.coordsX,
      originCoordsY: this.originBase.coordsY,
      originUser: this.originBase.user,
      destinationCoordsX: this.selectedNexus.coordsX,
      destinationCoordsY: this.selectedNexus.coordsY,
      destinationUser: this.selectedNexus.user,
      ...unitCounts,
      timestamp: new Date(),
      arrived: false
    } as NexusAttackSent;
  }
  calculateAttackDuration(unitStat?: UnitStats): number {
    if (!this.originBase || !this.selectedNexus) {
      alert("Problem setting duration! Either no origin or no destination selected!");
      return 0;
    }

    const distance = 1 + Math.abs(this.originBase.coordsX - this.selectedNexus.coordsX) + Math.abs(this.originBase.coordsY - this.selectedNexus.coordsY);

    if (unitStat) {
      return distance * unitStat.speed * 60;
    }
    let minSpeed = Infinity;
    if (this.unitStats) {
      for (const unit of this.unitStats) {
        if (unit.sentValue && unit.speed && unit.speed < minSpeed) {
          minSpeed = unit.speed;
        }
      }
    }
    if (minSpeed === Infinity) {
      minSpeed = 0;
    }

    return distance * minSpeed * 60;
  }

  isEngagingUnits() {
    if (!this.unitStats) return false;

    for (let i = 0; i < this.unitStats.length; i++) {
      const unit = this.unitStats[i];
      if (unit.sentValue && unit.sentValue > 0) {
        return true;
      }
    }

    return false;
  }

  hasUnitsToSend() {
    const availableUnits = this.nexusAvailableUnits;
    if (!availableUnits) return false;

    for (const key in availableUnits) {
      if (availableUnits[key as keyof NexusUnits] > 0) {
        return true;
      }
    }

    return false;
  }

  maxSliderValue(unit: UnitStats): number {
    const availableUnits = this.nexusAvailableUnits;
    if (!availableUnits) return 0;

    const unitTypeMap: { [key: string]: keyof NexusUnits } = {
      marine: 'marineTotal',
      goliath: 'goliathTotal',
      siege_tank: 'siegeTankTotal',
      scout: 'scoutTotal',
      wraith: 'wraithTotal',
      battlecruiser: 'battlecruiserTotal',
      glitcher: 'glitcherTotal',
    };

    return availableUnits[unitTypeMap[unit.unitType]] ?? 0;
  }

  onSliderChange(event: any, unit: UnitStats): void {
    const value = Math.min(this.maxSliderValue(unit), event.target.value);
    unit.sentValue = value;
    event.target.value = value;
  }
  formatTimer(allSeconds?: number): string {
    return this.nexusService.formatTimer(allSeconds);
  }
  closeAttackScreen() {
    const unitStats = this.unitStats;
    if (unitStats) {
      for (let i = 0; i < unitStats.length; i++) {
        unitStats[i].sentValue = undefined;
      }
    }
    this.emittedClosedAttackScreen.emit();
  }

  goToCoords(x: number, y: number) {
    this.emittedGoToCoords.emit([x, y]);
  }
  trackByUnit(index: number, unit: UnitStats): number {
    return unit.unitId; // or any unique identifier
  }
}
