import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy, QueryList, ViewChildren } from '@angular/core';
import { AppComponent } from '../app.component';
import { ChildComponent } from '../child.component';
import { CryptoCoinGraphViewerComponent } from '../crypto-coin-graph-viewer/crypto-coin-graph-viewer.component';
import { CryptoTradeLogsComponent } from '../crypto-trade-logs/crypto-trade-logs.component';
import { CryptoTradeHistoryComponent } from '../crypto-trade-history/crypto-trade-history.component';

@Component({
  selector: 'app-crypto-live-trade-view',
  standalone: false,
  templateUrl: './crypto-live-trade-view.component.html',
  styleUrl: './crypto-live-trade-view.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CryptoLiveTradeViewComponent extends ChildComponent implements AfterViewInit, OnDestroy {
  constructor(private cdr: ChangeDetectorRef) { super(); }

  // ViewChildren for accessing dynamic instances (useful for other logic, but not needed for destruction)
  @ViewChildren(CryptoCoinGraphViewerComponent) coinGraphViewers!: QueryList<CryptoCoinGraphViewerComponent>;
  @ViewChildren(CryptoTradeLogsComponent) tradeLogsComponents!: QueryList<CryptoTradeLogsComponent>;
  @ViewChildren(CryptoTradeHistoryComponent) tradeHistoryComponents!: QueryList<CryptoTradeHistoryComponent>;

  @Input() inputtedParentRef!: AppComponent;
  @Input() selectedCurrency!: string;
  @Input() latestCurrencyPriceRespectToCAD!: number;
  @Input() hasKrakenApi!: boolean;
  @Input() set activeTradeBots(value: { strategy: string; currency: string; startedSince: string }[]) {
    this._activeTradeBots = value;
    this._cachedUniqueCurrencyBots = null;
    this._cachedGroupedBots.clear();
    this.initializeVisibility();
    this.cdr.markForCheck();
  }

  private _activeTradeBots: { strategy: string; currency: string; startedSince: string }[] = [];
  private _cachedUniqueCurrencyBots: { strategy: string; currency: string; startedSince: string }[] | null = null;
  private _cachedGroupedBots: Map<string, { strategy: string; startedSince: string }[]> = new Map();
  visibleComponents = {
    graph: new Map<number, boolean>(),
    logs: new Map<number, boolean>(),
    history: new Map<number, boolean>()
  };
  private timeoutIds: number[] = []; // Store setTimeout IDs

  get activeTradeBots(): { strategy: string; currency: string; startedSince: string }[] {
    return this._activeTradeBots;
  }

  ngAfterViewInit() {
    this.initializeVisibility();
    this.cdr.markForCheck();

    // Optional: Subscribe to QueryList changes for debugging
    this.coinGraphViewers.changes.subscribe((ql: QueryList<CryptoCoinGraphViewerComponent>) => {
      console.log('CoinGraphViewers updated:', ql.length);
    });
    this.tradeLogsComponents.changes.subscribe((ql: QueryList<CryptoTradeLogsComponent>) => {
      console.log('TradeLogsComponents updated:', ql.length);
    });
    this.tradeHistoryComponents.changes.subscribe((ql: QueryList<CryptoTradeHistoryComponent>) => {
      console.log('TradeHistoryComponents updated:', ql.length);
    });
  }

  ngOnDestroy() {
    // Only clear custom timeouts; Angular handles child destruction automatically
    this.timeoutIds.forEach(id => clearTimeout(id));
    this.timeoutIds = [];
  }

  get uniqueCurrencyBots() {
    if (!this._cachedUniqueCurrencyBots) {
      const seen = new Set<string>();
      this._cachedUniqueCurrencyBots = this.activeTradeBots.filter(bot => {
        if (!seen.has(bot.currency)) {
          seen.add(bot.currency);
          return true;
        }
        return false;
      });
    }
    return this._cachedUniqueCurrencyBots;
  }

  groupedBotsByCurrency(currency: string) {
    if (!this._cachedGroupedBots.has(currency)) {
      this._cachedGroupedBots.set(
        currency,
        this.activeTradeBots
          .filter(bot => bot.currency === currency)
          .map(bot => ({ strategy: bot.strategy, startedSince: bot.startedSince }))
      );
    }
    return this._cachedGroupedBots.get(currency) || [];
  }

  getNominalCoinName(coin: string): string {
    const tmpCoin = coin.toUpperCase();
    if (tmpCoin == "XBT" || tmpCoin == "BTC") return "Bitcoin";
    else if (tmpCoin == "XDG") return "Dogecoin";
    else if (tmpCoin == "ETH") return "Ethereum";
    else if (tmpCoin == "SOL") return "Solana";
    else return tmpCoin;
  }

  initializeVisibility() {
    this.visibleComponents.graph.clear();
    this.visibleComponents.logs.clear();
    this.visibleComponents.history.clear();

    this.uniqueCurrencyBots.forEach((bot, i) => {
      this.visibleComponents.graph.set(i, false);
      const strategies = this.groupedBotsByCurrency(bot.currency);
      strategies.forEach((_, j) => {
        const combinedIndex = i + j;
        this.visibleComponents.logs.set(combinedIndex, false);
        this.visibleComponents.history.set(combinedIndex, false);
      });
    });

    this.setStaggeredVisibility();
  }

  setStaggeredVisibility() {
    this.visibleComponents.graph.clear();
    this.visibleComponents.logs.clear();
    this.visibleComponents.history.clear();

    this.uniqueCurrencyBots.forEach((_, i) => {
      this.visibleComponents.graph.set(i, false);
      const timeoutId1 = setTimeout(() => {
        this.visibleComponents.graph.set(i, true);
        this.cdr.detectChanges();
      }, i * 2000) as unknown as number;
      this.timeoutIds.push(timeoutId1);

      const strategies = this.groupedBotsByCurrency(_.currency);
      strategies.forEach((_, j) => {
        const combinedIndex = i + j;
        this.visibleComponents.logs.set(combinedIndex, false);
        this.visibleComponents.history.set(combinedIndex, false);

        const timeoutId2 = setTimeout(() => {
          this.visibleComponents.logs.set(combinedIndex, true);
          this.cdr.detectChanges();

          const timeoutId3 = setTimeout(() => {
            this.visibleComponents.history.set(combinedIndex, true);
            this.cdr.detectChanges();
          }, 1000) as unknown as number;
          this.timeoutIds.push(timeoutId3);
        }, (i * strategies.length + j) * 2000) as unknown as number;
        this.timeoutIds.push(timeoutId2);
      });
    });
  }

  shouldShowComponent(index: number, type: 'graph' | 'logs' | 'history'): boolean {
    return this.visibleComponents[type].get(index) || false;
  }
}