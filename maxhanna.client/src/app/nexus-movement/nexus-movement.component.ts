import { Component, EventEmitter, Input, Output, SimpleChanges, OnChanges } from '@angular/core';
import { User } from '../../services/datacontracts/user/user';
import { NexusAttackSent } from '../../services/datacontracts/nexus/nexus-attack-sent';

// Define sorting options
type SortOption = {
  name: string;
  key: string;
  direction: 'asc' | 'desc';
};

@Component({
  selector: 'app-nexus-movement',
  standalone: false,
  templateUrl: './nexus-movement.component.html',
  styleUrl: './nexus-movement.component.css'
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

  // Available sorting options
  sortOptions: SortOption[] = [
    { name: 'Time Remaining (Soonest First)', key: 'timeRemaining', direction: 'asc' },
    { name: 'Time Remaining (Latest First)', key: 'timeRemaining', direction: 'desc' },
    { name: 'Origin Player (A-Z)', key: 'originUser.username', direction: 'asc' },
    { name: 'Origin Player (Z-A)', key: 'originUser.username', direction: 'desc' },
    { name: 'Destination Player (A-Z)', key: 'destinationUser.username', direction: 'asc' },
    { name: 'Destination Player (Z-A)', key: 'destinationUser.username', direction: 'desc' },
    { name: 'Total Units (High-Low)', key: 'totalUnits', direction: 'desc' },
    { name: 'Total Units (Low-High)', key: 'totalUnits', direction: 'asc' },
    { name: 'Distance (Far-Near)', key: 'distance', direction: 'desc' },
    { name: 'Distance (Near-Far)', key: 'distance', direction: 'asc' }
  ];

  // Define movements with pagination, collapsible, and sorting properties
  movements = [
    {
      title: '⚔️ Attacks Sent',
      data: [] as NexusAttackSent[],
      emptyMessage: 'No attacks currently in progress',
      currentPage: 1,
      totalPages: 1,
      paginatedData: [] as NexusAttackSent[],
      isCollapsed: true,
      currentSort: this.sortOptions[0], // Default sort
      sortOptions: this.sortOptions
    },
    {
      title: '🎯 Attacks Incoming',
      data: [] as NexusAttackSent[],
      emptyMessage: 'No incoming attacks detected',
      currentPage: 1,
      totalPages: 1,
      paginatedData: [] as NexusAttackSent[],
      isCollapsed: true,
      currentSort: this.sortOptions[0], // Default sort
      sortOptions: this.sortOptions
    },
    {
      title: '🛡️ Defenses Sent',
      data: [] as NexusAttackSent[],
      emptyMessage: 'No defenses currently in progress',
      currentPage: 1,
      totalPages: 1,
      paginatedData: [] as NexusAttackSent[],
      isCollapsed: true,
      currentSort: this.sortOptions[0], // Default sort
      sortOptions: this.sortOptions
    },
    {
      title: '🧱 Defenses Incoming',
      data: [] as NexusAttackSent[],
      emptyMessage: 'No incoming defenses detected',
      currentPage: 1,
      totalPages: 1,
      paginatedData: [] as NexusAttackSent[],
      isCollapsed: true,
      currentSort: this.sortOptions[0], // Default sort
      sortOptions: this.sortOptions
    }
  ];

  // Update movements and pagination when inputs change
  ngOnChanges(changes: SimpleChanges) {
    this.movements = [
      {
        ...this.movements[0],
        data: this.sortData(this.nexusAttacksSent || [], this.movements[0].currentSort),
        totalPages: this.calculateTotalPages(this.nexusAttacksSent || []),
        paginatedData: this.getPaginatedData(
          this.sortData(this.nexusAttacksSent || [], this.movements[0].currentSort),
          this.movements[0].currentPage
        )
      },
      {
        ...this.movements[1],
        data: this.sortData(this.nexusAttacksIncoming || [], this.movements[1].currentSort),
        totalPages: this.calculateTotalPages(this.nexusAttacksIncoming || []),
        paginatedData: this.getPaginatedData(
          this.sortData(this.nexusAttacksIncoming || [], this.movements[1].currentSort),
          this.movements[1].currentPage
        )
      },
      {
        ...this.movements[2],
        data: this.sortData(this.nexusDefencesSent || [], this.movements[2].currentSort),
        totalPages: this.calculateTotalPages(this.nexusDefencesSent || []),
        paginatedData: this.getPaginatedData(
          this.sortData(this.nexusDefencesSent || [], this.movements[2].currentSort),
          this.movements[2].currentPage
        )
      },
      {
        ...this.movements[3],
        data: this.sortData(this.nexusDefencesIncoming || [], this.movements[3].currentSort),
        totalPages: this.calculateTotalPages(this.nexusDefencesIncoming || []),
        paginatedData: this.getPaginatedData(
          this.sortData(this.nexusDefencesIncoming || [], this.movements[3].currentSort),
          this.movements[3].currentPage
        )
      }
    ];
  }

  // Sort data based on the selected sort option
  private sortData(data: NexusAttackSent[], sortOption: SortOption): NexusAttackSent[] {
    const sortedData = [...data];

    sortedData.sort((a, b) => {
      // Calculate total units for sorting
      const aTotalUnits = this.getTotalUnits(a);
      const bTotalUnits = this.getTotalUnits(b);

      // Calculate distance for sorting (hypotenuse of coordinates)
      const aDistance = Math.sqrt(Math.pow(a.originCoordsX - a.destinationCoordsX, 2) +
        Math.pow(a.originCoordsY - a.destinationCoordsY, 2));
      const bDistance = Math.sqrt(Math.pow(b.originCoordsX - b.destinationCoordsX, 2) +
        Math.pow(b.originCoordsY - b.destinationCoordsY, 2));

      let valueA, valueB;

      switch (sortOption.key) {
        case 'timeRemaining':
          valueA = this.getRemainingTime(a);
          valueB = this.getRemainingTime(b);
          break;
        case 'originUser.username':
          valueA = a.originUser?.username?.toLowerCase() || '';
          valueB = b.originUser?.username?.toLowerCase() || '';
          break;
        case 'destinationUser.username':
          valueA = a.destinationUser?.username?.toLowerCase() || '';
          valueB = b.destinationUser?.username?.toLowerCase() || '';
          break;
        case 'totalUnits':
          valueA = aTotalUnits;
          valueB = bTotalUnits;
          break;
        case 'distance':
          valueA = aDistance;
          valueB = bDistance;
          break;
        default:
          valueA = 0;
          valueB = 0;
      }

      if (valueA < valueB) {
        return sortOption.direction === 'asc' ? -1 : 1;
      }
      if (valueA > valueB) {
        return sortOption.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });

    return sortedData;
  }

  // Calculate total units in a movement
  private getTotalUnits(attack: NexusAttackSent): number {
    return this.unitKeys.reduce((total, key) => total + (attack[key] ?? 0), 0);
  }

  // Change sort option for a movement section
  changeSort(movementIndex: number, sortOption: SortOption) {
    this.movements[movementIndex].currentSort = sortOption;
    this.movements[movementIndex].data = this.sortData(
      this.movements[movementIndex].data,
      sortOption
    );
    this.movements[movementIndex].paginatedData = this.getPaginatedData(
      this.movements[movementIndex].data,
      this.movements[movementIndex].currentPage
    );
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

  onSortChange(movementIndex: number, event: Event): void {
    const selectElement = event.target as HTMLSelectElement;
    const selectedSortName = selectElement.value;

    // Find the corresponding sort option
    const selectedOption = this.movements[movementIndex].sortOptions.find(
      option => option.name === selectedSortName
    );

    if (selectedOption) {
      this.changeSort(movementIndex, selectedOption);
    }
  }

  getRemainingTime(attack: NexusAttackSent): number {
    const arrivalTime = new Date(attack.timestamp).getTime() + (attack.duration * 1000);
    const now = Date.now();
    return Math.max(0, Math.floor((arrivalTime - now) / 1000));
  }

  formatRemainingTime(seconds: number): string {
    if (seconds <= 0) return 'Arrived!';

    // Days if more than 24 hours
    if (seconds >= 86400) {
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      return `${days}d ${hours}h`;
    }

    // Hours if more than 60 minutes
    if (seconds >= 3600) {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${mins}m`;
    }

    // Minutes if more than 60 seconds
    if (seconds >= 60) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}m ${secs}s`;
    }

    // Seconds only
    return `${seconds}s`;
  }
}