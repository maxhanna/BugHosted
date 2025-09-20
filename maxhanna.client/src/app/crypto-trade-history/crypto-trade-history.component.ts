import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { AppComponent } from '../app.component';
import { ChildComponent } from '../child.component';
import { TradeService } from '../../services/trade.service';

@Component({
  selector: 'app-crypto-trade-history',
  standalone: false,
  templateUrl: './crypto-trade-history.component.html',
  styleUrl: './crypto-trade-history.component.css'
})
export class CryptoTradeHistoryComponent extends ChildComponent implements AfterViewInit, OnDestroy {
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
  tradeHistoryInterval: any;
  timeLeft = 30;

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

  ngOnDestroy(): void {
    this.stopTradeHistoryPolling();
  }

  async checkBalance() {
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
        this.tradesPerPage
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
    this.timeLeft = 30;
    this.tradeHistoryInterval = setInterval(async () => {
      this.timeLeft--;
      if (this.timeLeft == 0) {
        this.checkBalance();
        this.timeLeft = 30;
      } else {
        this.changeDetectorRef.detectChanges();
      }
    }, 1000 * 1);
  }

  stopTradeHistoryPolling() {
    clearInterval(this.tradeHistoryInterval);
  }

  setPaginatedTrades() {
    this.paginatedTradebotBalances = this.tradebotBalances || [];
    this.changeDetectorRef.detectChanges();
  }

  onCoinChange(event: Event) {
    this.selectedCoin = (event.target as HTMLSelectElement).value;
    this.currentTradePage = 1;
    this.checkBalance();
  }

  onStrategyChange(event: Event) {
    this.selectedStrategy = (event.target as HTMLSelectElement).value;
    this.currentTradePage = 1;
    this.checkBalance();
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
