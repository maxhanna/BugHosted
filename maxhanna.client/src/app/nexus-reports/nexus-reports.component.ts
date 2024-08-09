import { Component, ElementRef, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { NexusBattleOutcome } from '../../services/datacontracts/nexus/nexus-battle-outcome';
import { User } from '../../services/datacontracts/user/user';
import { NexusService } from '../../services/nexus.service';
import { NexusBattleOutcomeReports } from '../../services/datacontracts/nexus/nexus-battle-outcome-reports';
import { NexusBase } from '../../services/datacontracts/nexus/nexus-base';
import { ChildComponent } from '../child.component';

@Component({
  selector: 'app-nexus-reports',
  templateUrl: './nexus-reports.component.html',
  styleUrl: './nexus-reports.component.css'
})
export class NexusReportsComponent extends ChildComponent implements OnInit, OnChanges {
  @Input() battleReports?: NexusBattleOutcomeReports;
  @Input() user?: User;
  @Input() targetBase?: NexusBase;
  @Output() openMapEmitter = new EventEmitter<string>;
   
  pageSizes: number[] = [5, 10, 20, 50];
  totalPages: number[] = [1];

  @ViewChild('pageSize') pageSize!: ElementRef<HTMLSelectElement>;
  @ViewChild('currentPage') currentPage!: ElementRef<HTMLSelectElement>;
  constructor(private nexusService: NexusService) { super(); }

  ngOnInit() {
    
    this.loadBattleReports(this.targetBase);
    
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['battleReports'] && this.battleReports) {
      this.FixCurrentPageDropdownValues();
    }
  }

  private FixCurrentPageDropdownValues() {
    if (!this.battleReports) return;
    let tmpPageSize = 5;
    if (this.pageSize && this.pageSize.nativeElement.value) {
      tmpPageSize = parseInt(this.pageSize.nativeElement.value);
    }
    this.totalPages = Array.from({ length: Math.ceil(this.battleReports.totalReports / tmpPageSize) }, (_, i) => i + 1);
  }

  getUnitsArray(units: Record<string, number>): { key: string, value: number }[] {
    if (!units || Object.keys(units).length === 0) {
      // Return an array of all zeros if the data is null
      return [
        { key: 'marine', value: 0 },
        { key: 'goliath', value: 0 },
        { key: 'siege_tank', value: 0 },
        { key: 'scout', value: 0 },
        { key: 'wraith', value: 0 },
        { key: 'battlecruiser', value: 0 },
        { key: 'glitcher', value: 0 }, 
      ];
    }
    return Object.entries(units).map(([key, value]) => ({ key, value }));
  }

  async deleteReport(report: NexusBattleOutcome) {
    if (!this.user || !this.battleReports) return;
    if (!confirm("Are you sure you wish to permanently delete this report?")) return;
    const index = this.battleReports!.battleOutcomes.findIndex(x => x.battleId === report.battleId);
    if (index !== -1) {
      this.battleReports!.battleOutcomes.splice(index, 1);
    }
    await this.nexusService.deleteReport(this.user, report.battleId);
  }


  async loadBattleReports(targetBase?: NexusBase) {
    if (!this.user) return;
    const pageSize = this.pageSize?.nativeElement.value ? parseInt(this.pageSize.nativeElement.value) : 5;
    const currentPage = this.currentPage?.nativeElement.value ?? 1;

    if (targetBase) {
      this.targetBase = targetBase;
    }
    this.startLoading();
    this.battleReports = await this.nexusService.getBattleReports(this.user, +currentPage, +pageSize, targetBase);
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
  async nextPage() {
    if (!this.user) return;
    const pageSize = parseInt(this.pageSize.nativeElement.value);
    const currentPage = this.currentPage.nativeElement.value;
    this.battleReports = await this.nexusService.getBattleReports(this.user, +currentPage, +pageSize);
    if (this.battleReports) {
      this.totalPages = Array.from({ length: Math.round(this.battleReports.totalReports / pageSize) }, (_, i) => i + 1);
    }
    else {
      this.totalPages = [1];
    }
  }
}
