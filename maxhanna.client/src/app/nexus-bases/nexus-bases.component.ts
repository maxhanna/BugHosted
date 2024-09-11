import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { NexusBase } from '../../services/datacontracts/nexus/nexus-base';
import { User } from '../../services/datacontracts/user/user';
import { NexusAttackSent } from '../../services/datacontracts/nexus/nexus-attack-sent';
import { NexusUnits } from '../../services/datacontracts/nexus/nexus-units';
import { NexusService } from '../../services/nexus.service';
import { ChildComponent } from '../child.component';

@Component({
  selector: 'app-nexus-bases',
  templateUrl: './nexus-bases.component.html',
  styleUrl: './nexus-bases.component.css', 
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NexusBasesComponent extends ChildComponent implements OnInit {
  constructor(private nexusService: NexusService) { super(); }
  @Input() user: User | undefined; 
  @Input() nexusBase: NexusBase | undefined;
  @Input() allNexusUnits: NexusUnits[] | undefined;
  @Input() mapData: NexusBase[] | undefined;
  @Input() attacksIncoming: NexusAttackSent[] | undefined;   
  @Input() defenceIncoming: NexusAttackSent[] | undefined;
  @Input() marinePictureSrc: string | undefined;
  @Input() goliathPictureSrc: string | undefined;
  @Input() siegeTankPictureSrc: string | undefined;
  @Input() scoutPictureSrc: string | undefined;
  @Input() wraithPictureSrc: string | undefined;
  @Input() battlecruiserPictureSrc: string | undefined;
  @Input() glitcherPictureSrc: string | undefined;

  @Output() emittedNotifications = new EventEmitter<string>();
  @Output() emittedBaseChange = new EventEmitter<NexusBase>();
  @Output() emittedUpgrade = new EventEmitter<[NexusBase[], string]>();

  @ViewChild('commandSelector') commandSelector!: ElementRef<HTMLSelectElement>;
  @ViewChild('pageSelect') pageSelect!: ElementRef<HTMLSelectElement>;
  @ViewChild('sortingSelect') sortingSelect!: ElementRef<HTMLSelectElement>;
  @ViewChild('sortOrderSelect') sortOrderSelect!: ElementRef<HTMLSelectElement>;

  currentPage = 1;
  totalPages = 1;
  itemsPerPage = 100;
  pageNumbers: number[] = [];
  paginatedData: NexusBase[] = [];
  sortBy = 'baseName'; // Default sort option
  sortOrder = 'asc'; // Default sort order (ascending)

  attacksMap: { [key: string]: NexusAttackSent[] } = {};
  defenceMap: { [key: string]: NexusAttackSent[] } = {};
  unitTypes = [
    { code: 'marineTotal', shortName: 'M', pictureSrc: 'marinePictureSrc' },
    { code: 'goliathTotal', shortName: 'G', pictureSrc: 'goliathPictureSrc' },
    { code: 'siegeTankTotal', shortName: 'ST', pictureSrc: 'siegeTankPictureSrc' },
    { code: 'scoutTotal', shortName: 'S', pictureSrc: 'scoutPictureSrc' },
    { code: 'wraithTotal', shortName: 'W', pictureSrc: 'wraithPictureSrc' },
    { code: 'battlecruiserTotal', shortName: 'B', pictureSrc: 'battlecruiserPictureSrc' },
    { code: 'glitcherTotal', shortName: 'GL', pictureSrc: 'glitcherPictureSrc' }
  ]; 
  commands = [
    "Upgrade Command Center", "Upgrade Mines", "Upgrade Supply Depot", "Upgrade Warehouse",
    "Upgrade Engineering Bay", "Upgrade Factory", "Upgrade Starport",
    "Build Marines", "Build Goliath", "Build Siege Tanks", "Build Scouts",
    "Build Wraith", "Build Battlecruisers", "Build Glitcher"
  ];
  ngOnInit() {
    this.getCurrentBases();
  }
  selectBase(nexusBase: NexusBase) { 
    this.emittedBaseChange.emit(nexusBase);
  }

  getUnitPictureSrc(pictureSrc: string) {
    if (pictureSrc) {
      return this[pictureSrc as keyof this];
    }
    return ''
  } 
  async selectCommand() {
    if (!confirm(`Command all bases to ${this.commandSelector.nativeElement.value}?`)) return;

    let commandPromise: Promise<NexusBase[]>;

    switch (this.commandSelector.nativeElement.value) {
      case 'Upgrade Command Center':
        commandPromise = this.nexusService.upgradeAll("command_center", this.user);
        break;
      case 'Upgrade Mines':
        commandPromise = this.nexusService.upgradeAll("mines", this.user);
        break;
      case 'Upgrade Supply Depot':
        commandPromise = this.nexusService.upgradeAll("supply_depot", this.user);
        break;
      case 'Upgrade Warehouse':
        commandPromise = this.nexusService.upgradeAll("warehouse", this.user);
        break;
      case 'Upgrade Engineering Bay':
        commandPromise = this.nexusService.upgradeAll("engineering_bay", this.user);
        break;
      case 'Upgrade Factory':
        commandPromise = this.nexusService.upgradeAll("factory", this.user);
        break;
      case 'Upgrade Starport':
        commandPromise = this.nexusService.upgradeAll("starport", this.user);
        break;
      case 'Build Marines':
        commandPromise = this.nexusService.massPurchase("marine", this.user);
        break;
      case 'Build Goliath':
        commandPromise = this.nexusService.massPurchase("goliath", this.user);
        break;
      case 'Build Siege Tanks':
        commandPromise = this.nexusService.massPurchase("siege_tank", this.user);
        break;
      case 'Build Scouts':
        commandPromise = this.nexusService.massPurchase("scout", this.user);
        break;
      case 'Build Wraith':
        commandPromise = this.nexusService.massPurchase("wraith", this.user);
        break;
      case 'Build Battlecruisers':
        commandPromise = this.nexusService.massPurchase("battlecruiser", this.user);
        break;
      case 'Build Glitcher':
        commandPromise = this.nexusService.massPurchase("glitcher", this.user);
        break;
      default:
        console.log('Unknown command');
        return;
    }

    if (commandPromise) {
      commandPromise.then(res => {
        this.emittedUpgrade.emit([res as NexusBase[], this.commandSelector.nativeElement.value ?? ""]);
        this.commandSelector.nativeElement.selectedIndex = 0;
      }).catch(err => {
        console.error('Command failed', err);
        this.commandSelector.nativeElement.selectedIndex = 0;
      });
    }
  }

  trackByCoords(index: number, base: any): string {
    return `${base.coordsX}-${base.coordsY}`;
  }

  getCurrentBases() {
    if (this.mapData && this.nexusBase) {
      let data = this.mapData.filter(x => x.user?.id === this.user?.id);

      // Sort the data
      data = this.sortData(data, (this.sortBy as keyof NexusBase), (this.sortOrder as "asc" | "desc"));

      // Paginate the data
      this.updatePagination(data.length, this.itemsPerPage);
      const startIndex = (this.currentPage - 1) * this.itemsPerPage;
      this.paginatedData = data.slice(startIndex, startIndex + this.itemsPerPage);
    } else {
      this.paginatedData = [];
    }
  }

  getAttacksForBase = this.memoize((coordsX: number, coordsY: number) => {
    if (this.attacksIncoming && this.attacksMap && Object.keys(this.attacksMap).length == 0) {
      this.attacksMap = {};
      const pertinentAttacks = this.attacksIncoming.filter(x => x.destinationUser?.id != this.user?.id);
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
  });

  getSupportForBase = this.memoize((coordsX: number, coordsY: number) => {
    if (this.defenceIncoming && this.defenceMap && Object.keys(this.defenceMap).length == 0) {
      this.defenceMap = {};
      const pertinentDefences = this.defenceIncoming.filter(x => x.destinationUser?.id == this.user?.id && !x.arrived);
      for (let defence of pertinentDefences) {
        const key = `${defence.destinationCoordsX},${defence.destinationCoordsY}`;
        if (!this.defenceMap[key]) {
          this.defenceMap[key] = [];
        }
        this.defenceMap[key].push(defence);
      }

    }
    const key = `${coordsX},${coordsY}`;
    return this.defenceMap[key] || [];
  });
  getUnitsForBase = this.memoize((coordsX: number, coordsY: number) => { 
    return this.allNexusUnits?.find(x => x.coordsX == coordsX && x.coordsY == coordsY) ?? undefined;
  });

  getBaseClass = this.memoize((base: any) => {
    return `borderUnderline smallFont ${this.isHighlightedBase(base) ? 'highlightedBase' : ''}`;
  });

  getAttackClass = this.memoize((base: any) => {
    return this.getAttacksCount(base) > 0 ? 'redText' : 'greyText';
  });

  getDefenceClass = this.memoize((base: any) => {
    return this.getDefenceCount(base) > 0 ? 'blueText' : 'greyText';
  });
  getUnitClass = this.memoize((base: any, unitCode: string) => {
    if (this.isValidUnitCode(unitCode)) {
      const hasUnits = this.getUnitTotal(base, unitCode as keyof NexusUnits) > 0;
      return `baseUnitCountSpan ${hasUnits ? 'gameNotification' : 'greyText'}`;
    }
    return 'baseUnitCountSpan greyText';
  }); 

  private isValidUnitCode(code: string): code is keyof NexusUnits {
    return ['marineTotal', 'goliathTotal', 'siegeTankTotal', 'scoutTotal', 'wraithTotal', 'battlecruiserTotal', 'glitcherTotal'].includes(code);
  }

  getAttacksCount = this.memoize((base: any) => {
    return this.getAttacksForBase(base.coordsX, base.coordsY).length;
  });
  getDefenceCount = this.memoize((base: any) => {
    return this.getSupportForBase(base.coordsX, base.coordsY).length;
  });
  getUnitTotalSafe = this.memoize((base: any, unitCode: string) => {
    return this.isValidUnitCode(unitCode) ? this.getUnitTotal(base, unitCode as keyof NexusUnits) : 0;
  });
  getUnitTotal = this.memoize((base: any, unitCode: keyof NexusUnits) => {
    const units: NexusUnits | undefined = this.getUnitsForBase(base.coordsX, base.coordsY);
    return units ? units[unitCode] : 0;
  });

  isHighlightedBase = this.memoize((base: any) => {
    return (this.nexusBase && base.coordsX === this.nexusBase.coordsX && base.coordsY === this.nexusBase.coordsY) ? true : false;
  });

  sortData(
    data: NexusBase[],
    sortBy: string, // This is now a string to handle dynamic keys
    sortOrder: 'asc' | 'desc'
  ): NexusBase[] {
    return data.sort((a, b) => {
      // Determine the value for sorting
      const aValue = this.getSortValue(a, sortBy);
      const bValue = this.getSortValue(b, sortBy);

      if (aValue === undefined || bValue === undefined) return 0;

      // Determine comparison method based on type
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortOrder === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      }

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
      }

      return 0;
    });
  }

// Helper function to get the sorting value based on sortBy
getSortValue(base: NexusBase, sortBy: string): number | string | undefined {
  // Check if sortBy is a property of NexusBase
  if (sortBy in base) {
    return base[sortBy as keyof NexusBase] as number | string | undefined;
  }

  // If not, assume it needs to be computed from allNexusUnits
  const units = this.allNexusUnits?.find(u => u.coordsX === base.coordsX && u.coordsY === base.coordsY);
  if (units) {
    return (units as any)[sortBy]; // Access dynamic property
  }

  return undefined;
}

  override sortTable(columnIndex: number, tableId: string): void {
    const table = document.getElementById(tableId) as HTMLTableElement;
    if (!table) return;

    const tbodyArray = Array.from(table.tBodies) as HTMLTableSectionElement[];
    const isAscending = this.asc.some(([table, column]) => table === tableId && column === columnIndex);

    // Custom comparator for sorting tbody elements
    const compare = (tbodyA: HTMLTableSectionElement, tbodyB: HTMLTableSectionElement) => {
      const getCellValue = (tbody: HTMLTableSectionElement) => {
        const cellText = tbody.rows[0].cells[columnIndex].textContent?.trim().toLowerCase() || '';

        // Remove commas and handle periods for numeric conversion
        const numericValue = parseFloat(cellText.replace(/,/g, ''));
        return isNaN(numericValue) ? cellText : numericValue;
      };

      const valueA = getCellValue(tbodyA);
      const valueB = getCellValue(tbodyB);

      // If both values are numeric, compare as numbers
      if (typeof valueA === 'number' && typeof valueB === 'number') {
        return isAscending ? valueA - valueB : valueB - valueA;
      }

      // Otherwise, compare as strings
      return isAscending ? (valueA as string).localeCompare(valueB as string) : (valueB as string).localeCompare(valueA as string);
    };

    // Sort tbody elements in memory
    tbodyArray.sort(compare);

    // Rebuild the table using a DocumentFragment
    const fragment = document.createDocumentFragment();
    tbodyArray.forEach(tbody => fragment.appendChild(tbody));

    // Append sorted tbody elements back to the table
    table.appendChild(fragment);

    // Update sort direction tracking
    if (isAscending) {
      this.asc = this.asc.filter(([table, column]) => !(table === tableId && column === columnIndex));
    } else {
      this.asc.push([tableId, columnIndex]);
    }
  }

  memoize(fn: Function) {
    const cache = new Map();
    return function (...args: any[]) {
      const key = JSON.stringify(args);
      if (cache.has(key)) {
        return cache.get(key);
      }
      const result = fn(...args);
      cache.set(key, result);
      return result;
    };
  }

  sortByCriterion(): void {
    this.sortBy = this.sortingSelect.nativeElement.value;
    this.getCurrentBases(); // Refresh data based on the selected sort criterion
  }
   
  updatePagination(totalItems: number, itemsPerPage: number): void {
    this.totalPages = Math.ceil(totalItems / itemsPerPage);
    this.pageNumbers = Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }

  // Method to handle page selection from dropdown
  goToPage(page: string): void {
    const pageNumber = parseInt(page, 10);
    if (pageNumber >= 1 && pageNumber <= this.totalPages) {
      this.currentPage = pageNumber;
      this.getCurrentBases();
    }
  }

  // Method to go to the previous page
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.getCurrentBases();
    }
  }

  // Method to go to the next page
  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.getCurrentBases();
    }
  }
}
