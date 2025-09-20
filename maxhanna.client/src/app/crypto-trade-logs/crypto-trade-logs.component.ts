import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { TradeService } from '../../services/trade.service';
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
  timeLeft = 30;
  private tradeLogInterval: any = null;

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

  private async fetchTradeLogs(selectedCoin?: string, selectedStrategy?: string) {
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
        this.logsPerPage
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
    this.timeLeft = 30;
    this.tradeLogInterval = setInterval(async () => {
      this.timeLeft--;
      if (this.timeLeft === 0) {  
        await this.fetchTradeLogs();
        this.timeLeft = 30;
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
}