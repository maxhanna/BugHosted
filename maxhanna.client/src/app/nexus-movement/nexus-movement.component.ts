import { Component, EventEmitter, Input, Output, SimpleChanges, OnChanges } from '@angular/core';
import { User } from '../../services/datacontracts/user/user';
import { NexusAttackSent } from '../../services/datacontracts/nexus/nexus-attack-sent';

@Component({
  selector: 'app-nexus-movement',
  standalone: false,
  templateUrl: './nexus-movement.component.html',
  styleUrls: ['./nexus-movement.component.css']
})
export class NexusMovementComponent implements OnChanges {
  @Input() user!: User;
  @Input() inputtedParentRef: any;
  @Input() marinePictureSrc: string | undefined;
  @Input() goliathPictureSrc: string | undefined;
  @Input() siegeTankPictureSrc: string | undefined;
  @Input() scoutPictureSrc: string | undefined;
  @Input() wraithPictureSrc: string | undefined;
  @Input() battlecruiserPictureSrc: string | undefined;
  @Input() glitcherPictureSrc: string | undefined;
  @Input() cclvl1Src: string | undefined;
  @Input() splvl1Src: string | undefined;
  @Input() sdlvl1Src: string | undefined;
  @Input() whlvl1Src: string | undefined;
  @Input() eblvl1Src: string | undefined;
  @Input() mineslvl1Src: string | undefined;
  @Input() flvl1Src: string | undefined;
  @Input() nexusAttacksSent?: NexusAttackSent[] = [];
  @Input() nexusAttacksIncoming?: NexusAttackSent[] = [];
  @Input() nexusDefencesSent?: NexusAttackSent[] = [];
  @Input() nexusDefencesIncoming?: NexusAttackSent[] = [];
  @Output() openMapEmitter = new EventEmitter<string>();

  // Pagination settings
  itemsPerPage = 5;

  // Define movements with pagination and collapsible properties
  movements = [
    {
      title: '🛫 Attacks Sent',
      data: [] as NexusAttackSent[],
      emptyMessage: 'No attacks currently in progress',
      currentPage: 1,
      totalPages: 1,
      paginatedData: [] as NexusAttackSent[],
      isCollapsed: true
    },
    {
      title: '🎯 Attacks Incoming',
      data: [] as NexusAttackSent[],
      emptyMessage: 'No incoming attacks detected',
      currentPage: 1,
      totalPages: 1,
      paginatedData: [] as NexusAttackSent[],
      isCollapsed: true
    },
    {
      title: '🛡️ Defenses Sent',
      data: [] as NexusAttackSent[],
      emptyMessage: 'No defenses currently in progress',
      currentPage: 1,
      totalPages: 1,
      paginatedData: [] as NexusAttackSent[],
      isCollapsed: true
    },
    {
      title: '🧱 Defenses Incoming',
      data: [] as NexusAttackSent[],
      emptyMessage: 'No incoming defenses detected',
      currentPage: 1,
      totalPages: 1,
      paginatedData: [] as NexusAttackSent[],
      isCollapsed: true
    }
  ];

  // Update movements and pagination when inputs change
  ngOnChanges(changes: SimpleChanges) {
    this.movements = [
      {
        title: '🛫 Attacks Sent',
        data: this.sortByTimestamp(this.nexusAttacksSent || []),
        emptyMessage: 'No attacks currently in progress',
        currentPage: this.movements[0].currentPage,
        totalPages: this.calculateTotalPages(this.nexusAttacksSent || []),
        paginatedData: this.getPaginatedData(this.sortByTimestamp(this.nexusAttacksSent || []), this.movements[0].currentPage),
        isCollapsed: this.movements[0].isCollapsed
      },
      {
        title: '🎯 Attacks Incoming',
        data: this.sortByTimestamp(this.nexusAttacksIncoming || []),
        emptyMessage: 'No incoming attacks detected',
        currentPage: this.movements[1].currentPage,
        totalPages: this.calculateTotalPages(this.nexusAttacksIncoming || []),
        paginatedData: this.getPaginatedData(this.sortByTimestamp(this.nexusAttacksIncoming || []), this.movements[1].currentPage),
        isCollapsed: this.movements[1].isCollapsed
      },
      {
        title: '🛡️ Defenses Sent',
        data: this.sortByTimestamp(this.nexusDefencesSent || []),
        emptyMessage: 'No defenses currently in progress',
        currentPage: this.movements[2].currentPage,
        totalPages: this.calculateTotalPages(this.nexusDefencesSent || []),
        paginatedData: this.getPaginatedData(this.sortByTimestamp(this.nexusDefencesSent || []), this.movements[2].currentPage),
        isCollapsed: this.movements[2].isCollapsed
      },
      {
        title: '🧱 Defenses Incoming',
        data: this.sortByTimestamp(this.nexusDefencesIncoming || []),
        emptyMessage: 'No incoming defenses detected',
        currentPage: this.movements[3].currentPage,
        totalPages: this.calculateTotalPages(this.nexusDefencesIncoming || []),
        paginatedData: this.getPaginatedData(this.sortByTimestamp(this.nexusDefencesIncoming || []), this.movements[3].currentPage),
        isCollapsed: this.movements[3].isCollapsed
      }
    ];
  }

  // Sort array by timestamp (descending, newest first) without modifying original
  private sortByTimestamp(data: NexusAttackSent[]): NexusAttackSent[] {
    return [...data].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  // Calculate total pages
  private calculateTotalPages(data: NexusAttackSent[]): number {
    return Math.ceil(data.length / this.itemsPerPage) || 1;
  }

  // Get paginated data for the current page
  private getPaginatedData(data: NexusAttackSent[], currentPage: number): NexusAttackSent[] {
    const startIndex = (currentPage - 1) * this.itemsPerPage;
    return data.slice(startIndex, startIndex + this.itemsPerPage);
  }

  // Navigate to previous page
  goToPreviousPage(movementIndex: number) {
    if (this.movements[movementIndex].currentPage > 1) {
      this.movements[movementIndex].currentPage--;
      this.movements[movementIndex].paginatedData = this.getPaginatedData(
        this.movements[movementIndex].data,
        this.movements[movementIndex].currentPage
      );
    }
  }

  // Navigate to next page
  goToNextPage(movementIndex: number) {
    if (this.movements[movementIndex].currentPage < this.movements[movementIndex].totalPages) {
      this.movements[movementIndex].currentPage++;
      this.movements[movementIndex].paginatedData = this.getPaginatedData(
        this.movements[movementIndex].data,
        this.movements[movementIndex].currentPage
      );
    }
  }

  // Toggle collapse state
  toggleCollapse(movementIndex: number) {
    this.movements[movementIndex].isCollapsed = !this.movements[movementIndex].isCollapsed;
  }

  // Define unit keys as a type-safe array
  private unitKeys: (keyof Pick<NexusAttackSent,
    'marineTotal' | 'goliathTotal' | 'siegeTankTotal' |
    'scoutTotal' | 'wraithTotal' | 'battlecruiserTotal' | 'glitcherTotal'
  >)[] = [
      'marineTotal',
      'goliathTotal',
      'siegeTankTotal',
      'scoutTotal',
      'wraithTotal',
      'battlecruiserTotal',
      'glitcherTotal'
    ];

  getUnitsArray(attack: NexusAttackSent): { key: string; value: number }[] {
    return this.unitKeys
      .map(key => ({ key, value: attack[key] ?? 0 }))
      .filter(unit => unit.value > 0);
  }

  getUnitPictureSrc(unitKey: string): string | undefined {
    const unitImageMap: { [key: string]: string | undefined } = {
      marineTotal: this.marinePictureSrc,
      goliathTotal: this.goliathPictureSrc,
      siegeTankTotal: this.siegeTankPictureSrc,
      scoutTotal: this.scoutPictureSrc,
      wraithTotal: this.wraithPictureSrc,
      battlecruiserTotal: this.battlecruiserPictureSrc,
      glitcherTotal: this.glitcherPictureSrc
    };
    return unitImageMap[unitKey] || '';
  }
}