import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { AppComponent } from '../app.component';
import { ChildComponent } from '../child.component';
import { TradeService, TradeHistoryFilters, downloadCsvReport } from '../../services/trade.service';

@Component({
  selector: 'app-crypto-trade-history',
  standalone: false,
  templateUrl: './crypto-trade-history.component.html',
  styleUrl: './crypto-trade-history.component.css'
})
export class CryptoTradeHistoryComponent extends ChildComponent implements AfterViewInit, OnDestroy, OnChanges {
  constructor(private tradeService: TradeService, private changeDetectorRef: ChangeDetectorRef) { super(); }

  @Input() inputtedParentRef!: AppComponent;
  @Input() selectedCurrency!: string;
  @Input() defaultCoin?: string;
  @Input() defaultStrategy?: string;
  @Input() hasKrakenApi?: boolean;

  @ViewChild('tradeBalanceCoinSelector') tradeBalanceCoinSelector!: ElementRef<HTMLSelectElement>;
  @ViewChild('tradeBalanceStrategySelector') tradeBalanceStrategySelector!: ElementRef<HTMLSelectElement>;

  paginatedTradebotBalances: any[] = [];
  currentTradePage = 1;
  tradesPerPage = this.onMobile() ? 10 : 30;
  totalTradePages = 0;
  tradebotBalances?: {
    id: number,
    user_id: number,
    from_currency: string,
    to_currency: string,
    value: string,
    strategy: string,
    coin_price_cad: string,
    coin_price_usdc: string,
    trade_value_cad: string,
    trade_value_usdc: string,
    fees: number,
    timestamp: Date,
    matching_trade_id: number | undefined,
    is_reserved: boolean | undefined,
  }[] = undefined;
  selectedTradeBalanceId?: number = undefined;
  selectedCoin: string = 'BTC'; // Default value
  selectedStrategy: string = 'DCA'; // Default value
  searchTerm = '';
  private searchDebounceTimer: any = null;
  tradeHistoryInterval: any;
  timeLeft = 120;
  defaultTimeLeft = 120;
  destroyed = false;

  // Options panel state (hidden div toggled by the ⚙ checkbox)
  showHistoryOptions = false;
  matchingTradeId = '';
  hasMatchingTrade = false;
  fromDate = '';
  toDate = '';
  spentMin = '';
  spentMax = '';
  receivedMin = '';
  receivedMax = '';
  hasPrice = false;
  exportingHistory = false;

  ngAfterViewInit(): void {
    // Initialize with default values if provided
    setTimeout(() => {
      if (this.defaultCoin) {
        this.selectedCoin = this.defaultCoin.replace("BTC", "XBT");
      }
      if (this.defaultStrategy) {
        this.selectedStrategy = this.defaultStrategy;
      }

      console.log(this.selectedCoin, this.selectedStrategy);
      this.checkBalance();
    }, 0);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (this.destroyed) {
      return;
    }
    // When the parent changes the default coin or strategy, reload or clear the trade history
    if (changes['defaultCoin'] && changes['defaultCoin'].currentValue !== changes['defaultCoin'].previousValue) {
      if (this.defaultCoin) {
        this.selectedCoin = this.defaultCoin.replace("BTC", "XBT");
        this.currentTradePage = 1;
        this.checkBalance();
      } else {
        // Clear existing data when no default coin is provided
        this.tradebotBalances = [];
        this.paginatedTradebotBalances = [];
        this.totalTradePages = 0;
        this.stopTradeHistoryPolling();
        this.changeDetectorRef.detectChanges();
      }
    }

    if (changes['defaultStrategy'] && changes['defaultStrategy'].currentValue !== changes['defaultStrategy'].previousValue) {
      this.selectedStrategy = this.defaultStrategy ?? this.selectedStrategy;
      this.currentTradePage = 1;
      this.checkBalance();
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.stopTradeHistoryPolling();
  }

  async checkBalance() {
    if (this.destroyed) {
      return;
    }
    this.stopTradeHistoryPolling();
    this.startLoading();
    const userId = this.hasKrakenApi ? this.inputtedParentRef.user?.id ?? 1 : 1;
    const sessionToken = await this.inputtedParentRef?.getSessionToken() ?? '';
    await this.tradeService
      .getTradeHistory(
        userId,
        sessionToken,
        this.selectedCoin,
        this.selectedStrategy,
        undefined,
        this.currentTradePage,
        this.tradesPerPage,
        this.searchTerm,
        this.buildHistoryFilters()
      )
      .then((res) => {
        if (res && res.trades) {
          this.tradebotBalances = res.trades;
          this.totalTradePages = Math.ceil(res.totalCount / this.tradesPerPage);
          this.setPaginatedTrades();
        } else {
          this.inputtedParentRef?.showNotification('Error, cannot get balances!');
        }
        this.stopLoading();
        this.startTradeHistoryPolling();
      });
  }

  startTradeHistoryPolling() {
    if (this.destroyed) {
      return;
    }

    if (this.tradeHistoryInterval) {
      clearInterval(this.tradeHistoryInterval);
    }

    this.timeLeft = this.defaultTimeLeft;
    this.tradeHistoryInterval = setInterval(async () => {
      this.timeLeft--;
      if (this.timeLeft == 0) {
        this.checkBalance();
        this.timeLeft = this.defaultTimeLeft;
      } else {
        this.changeDetectorRef.detectChanges();
      }
    }, 1000 * 1);
  }

  stopTradeHistoryPolling() {
    if (this.tradeHistoryInterval) {
      clearInterval(this.tradeHistoryInterval);
      this.tradeHistoryInterval = null;
    }
  }

  setPaginatedTrades() {
    this.paginatedTradebotBalances = this.tradebotBalances || [];
    this.changeDetectorRef.detectChanges();
  }

  onCoinChange(event: Event) {
    if (this.destroyed) {
      return;
    }
    this.selectedCoin = (event.target as HTMLSelectElement).value;
    this.currentTradePage = 1;
    this.checkBalance();
  }

  onStrategyChange(event: Event) {
    if (this.destroyed) {
      return;
    }
    this.selectedStrategy = (event.target as HTMLSelectElement).value;
    this.currentTradePage = 1;
    this.checkBalance();
  }

  onSearchInput(event: Event) {
    if (this.destroyed) {
      return;
    }
    // Update the field synchronously so the [value] binding doesn't revert typing.
    this.searchTerm = (event.target as HTMLInputElement).value;
    clearTimeout(this.searchDebounceTimer);
    this.searchDebounceTimer = setTimeout(() => {
      this.currentTradePage = 1;
      this.checkBalance();
    }, 400);
  }

  clearTradeSearch() {
    if (this.destroyed) {
      return;
    }
    clearTimeout(this.searchDebounceTimer);
    this.searchTerm = '';
    this.currentTradePage = 1;
    this.checkBalance();
  }

  // ---- Options panel: structured filters (all AND-combined server-side) ----

  private numOrUndefined(value: string): number | undefined {
    if (value === null || value === undefined || value === '' || isNaN(Number(value))) {
      return undefined;
    }
    return Number(value);
  }

  buildHistoryFilters(exportAll = false): TradeHistoryFilters {
    return {
      matchingTradeId: this.numOrUndefined(this.matchingTradeId),
      hasMatchingTrade: this.hasMatchingTrade,
      fromDate: this.fromDate ? new Date(this.fromDate + 'T00:00:00').toISOString() : undefined,
      toDate: this.toDate ? new Date(this.toDate + 'T23:59:59').toISOString() : undefined,
      spentMin: this.numOrUndefined(this.spentMin),
      spentMax: this.numOrUndefined(this.spentMax),
      receivedMin: this.numOrUndefined(this.receivedMin),
      receivedMax: this.numOrUndefined(this.receivedMax),
      hasPrice: this.hasPrice,
      exportAll,
    };
  }

  onHistoryFilterInput(event: Event, field: string) {
    if (this.destroyed) {
      return;
    }
    (this as any)[field] = (event.target as HTMLInputElement).value;
    this.debounceHistoryRefresh();
  }

  onHistoryFilterCheck(event: Event, field: string) {
    if (this.destroyed) {
      return;
    }
    (this as any)[field] = (event.target as HTMLInputElement).checked;
    this.debounceHistoryRefresh();
  }

  debounceHistoryRefresh() {
    clearTimeout(this.searchDebounceTimer);
    this.searchDebounceTimer = setTimeout(() => {
      this.currentTradePage = 1;
      this.checkBalance();
    }, 400);
  }

  clearHistoryFilters() {
    if (this.destroyed) {
      return;
    }
    clearTimeout(this.searchDebounceTimer);
    this.matchingTradeId = '';
    this.hasMatchingTrade = false;
    this.fromDate = '';
    this.toDate = '';
    this.spentMin = '';
    this.spentMax = '';
    this.receivedMin = '';
    this.receivedMax = '';
    this.hasPrice = false;
    this.currentTradePage = 1;
    this.checkBalance();
  }

  // ---- Export filtered data to CSV (Excel-compatible) ----

  async exportTradeHistoryToCsv() {
    if (this.destroyed || this.exportingHistory) {
      return;
    }
    this.exportingHistory = true;
    try {
      const userId = this.hasKrakenApi ? this.inputtedParentRef.user?.id ?? 1 : 1;
      const sessionToken = await this.inputtedParentRef?.getSessionToken() ?? '';
      const res = await this.tradeService.getTradeHistory(
        userId,
        sessionToken,
        this.selectedCoin,
        this.selectedStrategy,
        undefined,
        1,
        5000,
        this.searchTerm,
        this.buildHistoryFilters(true)
      );
      if (res && res.trades && res.trades.length > 0) {
        const headers = ['ID', 'From', 'To', 'Value', 'Coin Price USDC', 'Coin Price CAD', 'Trade Value USDC', 'Trade Value CAD', 'Fees', 'Timestamp (UTC)', 'Matching Trade ID', 'Reserved'];
        const rows = res.trades.map((t: any) => [
          t.id, t.from_currency, t.to_currency, t.value, t.coin_price_usdc, t.coin_price_cad,
          t.trade_value_usdc, t.trade_value_cad, t.fees, t.timestamp, t.matching_trade_id ?? '',
          t.is_reserved ? 'yes' : ''
        ]);
        downloadCsvReport(`trade-history-${this.selectedCoin}-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
        const total = res.totalCount ?? res.trades.length;
        this.inputtedParentRef?.showNotification(
          res.trades.length < total
            ? `Exported first ${res.trades.length} of ${total} matching trades.`
            : `Exported ${res.trades.length} trades.`
        );
      } else {
        this.inputtedParentRef?.showNotification('No trades matched the filters to export.');
      }
    } catch (error) {
      console.error('Export failed:', error);
      this.inputtedParentRef?.showNotification('Export failed: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      this.exportingHistory = false;
    }
  }

  scrollUpTradePage() {
    document.getElementsByClassName("mainTableContainer")[0].scrollTop = 0;
  }

  nextTradePage() {
    if (this.currentTradePage < this.totalTradePages) {
      this.currentTradePage++;
      this.checkBalance();
      this.scrollUpTradePage();
    }
  }

  prevTradePage() {
    if (this.currentTradePage > 1) {
      this.currentTradePage--;
      this.checkBalance();
      this.scrollUpTradePage();
    }
  }

  goToTradePage(page: number) {
    if (page >= 1 && page <= this.totalTradePages) {
      this.currentTradePage = page;
      this.checkBalance();
      this.scrollUpTradePage();
    }
  }

  getTradePagesArray(): number[] {
    return Array.from({ length: this.totalTradePages }, (_, i) => i + 1);
  }

  goToTradePageSelected(event: Event) {
    const page = parseInt((event.target as HTMLSelectElement).value);
    this.goToTradePage(page)
    this.scrollUpTradePage();
  }

  async goToTradeId(tradeId?: number) {
    if (!tradeId) return;

    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      this.selectedTradeBalanceId = tradeId;

      const tradeIndex = this.tradebotBalances?.findIndex(trade => trade.id === tradeId) ?? -1;
      if (tradeIndex >= 0) {
        const targetPage = Math.floor(tradeIndex / this.tradesPerPage) + 1;
        if (targetPage !== this.currentTradePage) {
          this.currentTradePage = targetPage;
          this.checkBalance();
        }

        setTimeout(() => {
          const element = document.getElementById('tradeBalance' + tradeId);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          }
        }, 100);
      } else {
        const sessionToken = await this.inputtedParentRef.getSessionToken() ?? '';
        const userId = this.hasKrakenApi ? this.inputtedParentRef.user?.id ?? 1 : 1;
        const pageInfo = await this.tradeService.getPageForTradeId(
          userId,
          tradeId,
          this.tradesPerPage,
          this.selectedCoin ?? 'XBT',
          this.selectedStrategy ?? 'DCA',
          sessionToken
        );

        if (pageInfo && pageInfo >= 1) {
          const trades = await this.tradeService.getTradesForPage(
            userId,
            pageInfo,
            this.tradesPerPage,
            this.selectedCoin ?? 'XBT',
            this.selectedStrategy ?? 'DCA',
            sessionToken
          );

          if (trades && trades.length > 0) {
            this.tradebotBalances = trades;
            this.currentTradePage = pageInfo;
            this.checkBalance();

            setTimeout(() => {
              const element = document.getElementById('tradeBalance' + tradeId);
              if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
              } else {
                console.warn(`Element tradeBalance${tradeId} not found after fetching page.`);
              }
            }, 100);
          } else {
            this.inputtedParentRef.showNotification(`No trades found for page containing Trade ID ${tradeId}.`);
          }
        } else {
          this.inputtedParentRef.showNotification(`Trade ID ${tradeId} not found.`);
        }
      }
    }, 50);
  }

  trackByTradeId(index: number, trade: any): string {
    return trade.id;
  }
}
