import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { TradeService, TradeHistoryFilters, downloadCsvReport } from '../../services/trade.service';
import { AppComponent } from '../app.component';

@Component({
  selector: 'app-crypto-trade-logs',
  standalone: false,
  templateUrl: './crypto-trade-logs.component.html',
  styleUrl: './crypto-trade-logs.component.css'
})
export class CryptoTradeLogsComponent extends ChildComponent implements AfterViewInit, OnDestroy {
  constructor(private tradeService: TradeService, private changeDetectorRef: ChangeDetectorRef) { super(); }

  @ViewChild('tradeLogStrategyFilter') tradeLogStrategyFilter!: ElementRef<HTMLSelectElement>;
  @ViewChild('tradeLogCoinFilter') tradeLogCoinFilter!: ElementRef<HTMLSelectElement>;

  @Input() inputtedParentRef!: AppComponent;
  @Input() hasKrakenApi!: Boolean;
  @Input() defaultCoin?: string;
  @Input() defaultStrategy?: string;

  tradeLogs: any[] = [];
  currentLogPage = 1;
  logsPerPage = 10;
  totalLogPages = 0;
  totalLogs = 0;
  selectedCoin?: string;
  selectedStrategy?: string;
  searchTerm = '';
  private searchDebounceTimer: any = null;
  timeLeft = 120;
  defaultTimeLeft = 120;
  private tradeLogInterval: any = null;

  // Options panel state (hidden div toggled by the ⚙ checkbox)
  showLogOptions = false;
  logFromDate = '';
  logToDate = '';
  showTradeReserves = false;
  exportingLogs = false;

  async ngAfterViewInit() {
    setTimeout(() => {
      if (this.defaultCoin) {
        this.selectedCoin = this.defaultCoin.replace("BTC", "XBT");
      }
      if (this.defaultStrategy) {
        this.selectedStrategy = this.defaultStrategy;
      }

      if (!this.onMobile()) {
        this.logsPerPage = 30;
      }
      this.fetchTradeLogs(this.selectedCoin, this.selectedStrategy);
    }, 50);
  }

  ngOnDestroy() {
    this.stopTradeLogPolling();
  }

  private async fetchTradeLogs(selectedCoin?: string, selectedStrategy?: string, search?: string) {
    try {
      this.stopTradeLogPolling();
      this.startLoading();
      const coin = selectedCoin ?? this.tradeLogCoinFilter?.nativeElement?.value;
      const strategy = selectedStrategy ?? this.tradeLogStrategyFilter?.nativeElement?.value;
      const sessionToken = await this.inputtedParentRef.getSessionToken() ?? "";
      const userId = this.hasKrakenApi ? this.inputtedParentRef.user?.id ?? 1 : 1;
      const response = await this.tradeService.getTradeLogs(
        userId,
        coin ?? this.selectedCoin ?? "BTC",
        strategy ?? this.selectedStrategy ?? "DCA",
        sessionToken,
        this.currentLogPage,
        this.logsPerPage,
        search ?? this.searchTerm,
        this.buildLogFilters()
      );
      this.tradeLogs = response.logs;
      this.totalLogs = response.total;
      this.totalLogPages = Math.ceil(this.totalLogs / this.logsPerPage);
      setTimeout(() => {
        if (selectedCoin && this.tradeLogCoinFilter?.nativeElement) {
          this.tradeLogCoinFilter.nativeElement.value = selectedCoin.replace("BTC", "XBT").replace("Bitcoin", "XBT");
        }
        if (selectedStrategy && this.tradeLogStrategyFilter?.nativeElement) {
          this.tradeLogStrategyFilter.nativeElement.value = selectedStrategy;
        }
      });
    } catch (error) {
      console.error('Failed to fetch trade logs:', error);
    } finally {
      this.stopLoading();
      this.startTradeLogPolling();
    }
  }

  startTradeLogPolling() {
    if (this.tradeLogInterval) {
      clearInterval(this.tradeLogInterval); 
    }
    this.timeLeft = this.defaultTimeLeft;
    this.tradeLogInterval = setInterval(async () => {
      this.timeLeft--;
      if (this.timeLeft === 0) {  
        await this.fetchTradeLogs();
        this.timeLeft = this.defaultTimeLeft;
      } else {
        this.changeDetectorRef.detectChanges();
      }
    }, 1000);
  }

  stopTradeLogPolling() {
    clearInterval(this.tradeLogInterval);
  }

  nextLogPage() {
    if (this.currentLogPage < this.totalLogPages) {
      this.currentLogPage++;
      this.fetchTradeLogs();
    }
  }

  prevLogPage() {
    if (this.currentLogPage > 1) {
      this.currentLogPage--;
      this.fetchTradeLogs();
    }
  }

  getLogPagesArray(): number[] {
    return Array.from({ length: this.totalLogPages }, (_, i) => i + 1);
  }

  goToLogPage(page: number): void {
    if (page >= 1 && page <= this.totalLogPages) {
      this.currentLogPage = page;
      this.fetchTradeLogs();
    }
  }

  goToLogPageSelected(event: Event): void {
    const page = parseInt((event?.target as HTMLSelectElement).value);
    this.goToLogPage(page);
  }

  filterLogsFromEvent() {
    const strategy = this.tradeLogStrategyFilter?.nativeElement?.value;
    const coin = this.tradeLogCoinFilter?.nativeElement?.value;
    this.currentLogPage = 1;
    this.selectedCoin = coin;
    this.selectedStrategy = strategy;
    this.fetchTradeLogs(this.selectedCoin, this.selectedStrategy);
  }

  onSearchInput(event: Event) {
    // Update the field synchronously so the [value] binding doesn't revert typing.
    this.searchTerm = (event.target as HTMLInputElement).value;
    clearTimeout(this.searchDebounceTimer);
    this.searchDebounceTimer = setTimeout(() => {
      this.currentLogPage = 1;
      this.fetchTradeLogs();
    }, 400);
  }

  clearLogSearch() {
    clearTimeout(this.searchDebounceTimer);
    this.searchTerm = '';
    this.currentLogPage = 1;
    this.fetchTradeLogs();
  }

  // ---- Options panel: date-range filters (AND-combined with the keyword search) ----

  buildLogFilters(exportAll = false): TradeHistoryFilters {
    return {
      fromDate: this.logFromDate ? new Date(this.logFromDate + 'T00:00:00').toISOString() : undefined,
      toDate: this.logToDate ? new Date(this.logToDate + 'T23:59:59').toISOString() : undefined,
      showTradeReserves: this.showTradeReserves,
      exportAll,
    } as TradeHistoryFilters;
  }

  onTradeReservesToggle(event: Event) {
    this.showTradeReserves = (event.target as HTMLInputElement).checked;
    this.currentLogPage = 1;
    this.fetchTradeLogs();
  }

  onLogFilterInput(event: Event, field: string) {
    (this as any)[field] = (event.target as HTMLInputElement).value;
    clearTimeout(this.searchDebounceTimer);
    this.searchDebounceTimer = setTimeout(() => {
      this.currentLogPage = 1;
      this.fetchTradeLogs();
    }, 400);
  }

  clearLogFilters() {
    clearTimeout(this.searchDebounceTimer);
    this.logFromDate = '';
    this.logToDate = '';
    this.showTradeReserves = false;
    this.currentLogPage = 1;
    this.fetchTradeLogs();
  }

  // ---- Export filtered logs to CSV (Excel-compatible) ----

  async exportTradeLogsToCsv() {
    if (this.exportingLogs) {
      return;
    }
    this.exportingLogs = true;
    try {
      const coin = this.selectedCoin ?? this.tradeLogCoinFilter?.nativeElement?.value ?? 'BTC';
      const strategy = this.selectedStrategy ?? this.tradeLogStrategyFilter?.nativeElement?.value ?? 'DCA';
      const sessionToken = await this.inputtedParentRef.getSessionToken() ?? "";
      const userId = this.hasKrakenApi ? this.inputtedParentRef.user?.id ?? 1 : 1;
      const response = await this.tradeService.getTradeLogs(
        userId,
        coin,
        strategy,
        sessionToken,
        1,
        25000,
        this.searchTerm,
        this.buildLogFilters(true)
      );
      if (response && response.logs && response.logs.length > 0) {
        const headers = ['Comment', 'Time (UTC)'];
        const rows = response.logs.map((log: any) => [log.comment, log.timestampUtc]);
        downloadCsvReport(`trade-logs-${coin}-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
        const total = response.total ?? response.logs.length;
        this.inputtedParentRef.showNotification(
          response.logs.length < total
            ? `Exported first ${response.logs.length} of ${total} log lines.`
            : `Exported ${response.logs.length} log lines.`
        );
      } else {
        this.inputtedParentRef.showNotification('No logs matched the filters to export.');
      }
    } catch (error) {
      console.error('Log export failed:', error);
      this.inputtedParentRef.showNotification('Log export failed: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      this.exportingLogs = false;
    }
  }
}