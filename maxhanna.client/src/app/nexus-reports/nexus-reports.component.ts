import { Component, ElementRef, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { NexusBattleOutcome } from '../../services/datacontracts/nexus/nexus-battle-outcome';
import { User } from '../../services/datacontracts/user/user';
import { NexusService } from '../../services/nexus.service';
import { NexusBattleOutcomeReports } from '../../services/datacontracts/nexus/nexus-battle-outcome-reports';
import { NexusBase } from '../../services/datacontracts/nexus/nexus-base';
import { ChildComponent } from '../child.component';
import { AppComponent } from '../app.component';

@Component({
  selector: 'app-nexus-reports',
  templateUrl: './nexus-reports.component.html',
  styleUrl: './nexus-reports.component.css'
})
export class NexusReportsComponent extends ChildComponent implements OnInit, OnChanges {
  @Input() battleReports?: NexusBattleOutcomeReports;
  @Input() user?: User;
  @Input() inputtedParentRef?: AppComponent;
  @Input() mapData?: NexusBase[];
  @Input() targetBase?: NexusBase;
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
  @Output() openMapEmitter = new EventEmitter<string>;

  userSearchOpen = false; 
  targetUser?: User = undefined;
  selectedReportIds = new Set<number>;
  pageSizes: number[] = [5, 10, 20, 50];
  totalPages: number[] = [1];
  unitOrder = [
    'marine',
    'goliath',
    'siege_tank',
    'scout',
    'wraith',
    'battlecruiser',
    'glitcher'
  ];
  buildingOrder = [
    'command_center',
    'mines',
    'engineering_bay',
    'factory',
    'starport',
    'warehouse',
    'supply_depot'
  ];

  @ViewChild('pageSize') pageSize!: ElementRef<HTMLSelectElement>;
  @ViewChild('currentPage') currentPage!: ElementRef<HTMLSelectElement>;
  @ViewChild('selectAllCheckbox') selectAllCheckbox!: ElementRef<HTMLInputElement>;
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;
  constructor(private nexusService: NexusService) { super(); }

  ngOnInit() { 
    this.loadBattleReports(this.targetBase);  
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['battleReports'] && this.battleReports) {
      this.FixCurrentPageDropdownValues();
      this.pageSize.nativeElement.value = this.battleReports.pageSize + '';
    }
  }
  getUnitPictureSrc(key: string) {
    return this[(key + 'PictureSrc') as keyof this];
  }
  private FixCurrentPageDropdownValues() {
    if (!this.battleReports) return;
    let tmpPageSize = this.battleReports.pageSize;
    this.totalPages = Array.from({ length: Math.ceil(this.battleReports.totalReports / tmpPageSize) }, (_, i) => i + 1);
    setTimeout(() => {
      if (this.pageSize) {
        this.pageSize.nativeElement.selectedIndex = this.pageSizes.indexOf(tmpPageSize);
      }
    }, 1);
  }

  getUnitsArray(units: Record<string, number>): { key: string, value: number }[] { 
    if (!units || Object.keys(units).length === 0) {
      return this.unitOrder.map(unit => ({ key: unit, value: 0 }));
    }

    return this.unitOrder.map(unit => ({
      key: unit,
      value: units[unit] || 0
    }));
  }

  async deleteReport(report: NexusBattleOutcome) {
    if (!this.user || !this.battleReports) return; 
    this.nexusService.deleteReport(this.user, [report.battleId]); 
    this.loadBattleReports(this.targetBase); 
  }

  async deleteAllReports() {
    if (!this.user || !this.battleReports) return;
    this.nexusService.deleteReport(this.user);
    this.battleReports.battleOutcomes = [];
    this.battleReports.totalReports = 0;
  }

  async loadBattleReports(targetBase?: NexusBase) {
    if (!this.user) return;
    const pageSize = this.pageSize?.nativeElement.value ? parseInt(this.pageSize.nativeElement.value) : 5;
    const currentPage = this.currentPage?.nativeElement.value ?? 1;

    if (targetBase) {
      this.targetBase = targetBase;
    }
    this.startLoading();
    this.battleReports = await this.nexusService.getBattleReports(this.user, +currentPage, +pageSize, this.targetBase, this.targetUser);
    this.stopLoading();

    if (this.battleReports) {
      this.totalPages = Array.from({ length: Math.round(this.battleReports.totalReports / pageSize) }, (_, i) => i + 1);
    }
    else {
      this.totalPages = [1];
    }
    this.FixCurrentPageDropdownValues();
  }


  onPageSizeChange() {
    this.loadBattleReports(this.targetBase);
  }

  onPageChange() {
    this.loadBattleReports(this.targetBase);
  }
  canSeeNextPage() {
    return (this.totalPages && this.totalPages.length > 0 && this.battleReports && this.battleReports.totalReports && this.pageSize && this.battleReports.totalReports > parseInt(this.pageSize.nativeElement.value));
  }
  getBaseNameForCoords(x: number, y: number) {
    return this.mapData?.find(base => base.coordsX == x && base.coordsY == y)?.baseName;
  }
  async nextPage() {
    if (!this.user) return;
    const pageSize = parseInt(this.pageSize.nativeElement.value);
    this.currentPage.nativeElement.value = parseInt(this.currentPage.nativeElement.value) + 1 + "";
    let currentPage = parseInt(this.currentPage.nativeElement.value);
    this.battleReports = await this.nexusService.getBattleReports(this.user, currentPage, pageSize, this.targetBase);
    if (this.battleReports) {
      this.totalPages = Array.from({ length: Math.round(this.battleReports.totalReports / pageSize) }, (_, i) => i + 1);
    }
    else {
      this.totalPages = [1];
    }
  }

  onReportSelectionChange(battleId: number, event: any) {
    if (event.target.checked) {
      this.selectedReportIds.add(battleId);
    } else {
      this.selectedReportIds.delete(battleId);
    }  
  }

  async deleteSelectedReports() {
    if (this.selectedReportIds.size === 0) {
      return alert('No reports selected');
    }
    if (!this.user) {
      return alert('Must be logged in!');
    } 

    await this.nexusService.deleteReport(this.user, Array.from(this.selectedReportIds));
    await this.loadBattleReports(this.targetBase);

    this.selectAllCheckbox.nativeElement.checked = false;
    const checkboxes = (document.getElementsByTagName('input'));
    for (let x = 0; x < checkboxes.length; x++) {
      (checkboxes[x] as HTMLInputElement).checked = false;
    }
    this.selectedReportIds.clear();
  }
  selectAllCheckboxes(event: Event) {
    const selectAllChecked = (event.target as HTMLInputElement).checked;
    const checkboxes = (document.getElementsByTagName('input'));

    let selectedReportIds = this.selectedReportIds;
    const updatedSelectedIds = new Set<number>();

    for (let x = 0; x < checkboxes.length; x++) {
      const inputElement = checkboxes[x] as HTMLInputElement;
      inputElement.checked = selectAllChecked;

      if (selectAllChecked) {
        const id = parseInt(inputElement.value, 10); // Assuming checkbox value holds the ID
        if (!isNaN(id)) {
          updatedSelectedIds.add(id);
        }
      }
    }
    this.selectedReportIds = updatedSelectedIds;  
  }
  searchReports(user?: User) {
    if (!user) return;
    console.log(user);
    this.targetUser = user;
    this.userSearchOpen = false;
    if (this.inputtedParentRef) {
      this.inputtedParentRef.isShowingOverlay = false;
    }
    this.loadBattleReports(this.targetBase);
  }
  showUserSearchOverlay() {
    this.userSearchOpen = !this.userSearchOpen;
    if (this.inputtedParentRef && this.userSearchOpen) {
      this.inputtedParentRef.showOverlay();
    }
    else if (this.inputtedParentRef) {
      this.inputtedParentRef.closeOverlay();
    }
  }
  clearTargetUser() { 
    this.targetUser = undefined;
    this.userSearchOpen = false;
    this.loadBattleReports(this.targetBase);
  }
}
