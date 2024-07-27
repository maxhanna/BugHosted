import { Component, ElementRef, Input, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { NexusBattleOutcome } from '../../services/datacontracts/nexus/nexus-battle-outcome';
import { User } from '../../services/datacontracts/user/user';
import { NexusService } from '../../services/nexus.service';
import { NexusBattleOutcomeReports } from '../../services/datacontracts/nexus/nexus-battle-outcome-reports';
import { NexusBase } from '../../services/datacontracts/nexus/nexus-base';

@Component({
  selector: 'app-nexus-reports',
  templateUrl: './nexus-reports.component.html',
  styleUrl: './nexus-reports.component.css'
})
export class NexusReportsComponent implements OnChanges {
  @Input() battleReports?: NexusBattleOutcomeReports;
  @Input() user?: User;

  pageSizes: number[] = [5, 10, 20, 50];
  totalPages: number[] = [1];
  targetBase?: NexusBase;

  @ViewChild('pageSize') pageSize!: ElementRef<HTMLSelectElement>;
  @ViewChild('currentPage') currentPage!: ElementRef<HTMLSelectElement>;
  constructor(private nexusService: NexusService) { }

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

    this.battleReports = await this.nexusService.getBattleReports(this.user, +currentPage, +pageSize, targetBase);
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
