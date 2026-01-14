import { AfterViewInit, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { CoinValueService } from '../../services/coin-value.service';
import { TradeService } from '../../services/trade.service';
import { AppComponent } from '../app.component';
import { CoinValue } from '../../services/datacontracts/crypto/coin-value';
import { LineGraphComponent } from '../line-graph/line-graph.component';

@Component({
  selector: 'app-crypto-coin-graph-viewer',
  standalone: false,
  templateUrl: './crypto-coin-graph-viewer.component.html',
  styleUrl: './crypto-coin-graph-viewer.component.css'
})
export class CryptoCoinGraphViewerComponent extends ChildComponent implements OnInit, OnChanges, OnDestroy {
  constructor(private coinValueService: CoinValueService, private tradeService: TradeService, private changeDetectorRef: ChangeDetectorRef) { super(); }

  @Input() inputtedParentRef!: AppComponent;
  @Input() currentSelectedCoin!: string;
  @Input() selectedCurrency!: string;
  @Input() latestCurrencyPriceRespectToCAD!: number;
  @Input() isPaused: boolean = false;

  @ViewChild(LineGraphComponent) lineGraphComponent!: LineGraphComponent;

  lineGraphInitialPeriod: '5min' | '15min' | '1h' | '6h' | '12h' | '1d' | '2d' | '5d' | '1m' | '2m' | '3m' | '6m' | '1y' | '2y' | '3y' | '5y' | 'max' = '6h';
  allHistoricalData?: CoinValue[] = [];
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
  tradebotTradeValuesForMainGraph: { timestamp: string | Date; priceCAD: number; tradeValueCAD: number; type: string }[] = [];
  private pollingInterval: any;
  private timeouts: any[] = [];
  private destroyed = false;
  timeLeft = 120;
  defaultTimeLeft = 120;

  ngOnInit() {
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['currentSelectedCoin'] && changes['currentSelectedCoin'].currentValue !== changes['currentSelectedCoin'].previousValue) {
      this.changeTimePeriodEventOnBTCHistoricalGraph(this.lineGraphInitialPeriod);
    }

    // Pause/resume polling when parent toggles isPaused
    if (changes['isPaused'] && changes['isPaused'].currentValue !== changes['isPaused'].previousValue) {
      if (changes['isPaused'].currentValue === true) {
        this.stopPolling();
      } else {
        // resume polling only if current period is short (<=24h) where polling is desired
        const hours = this.tradeService.convertTimePeriodToHours(this.lineGraphInitialPeriod);
        if (hours <= 24) {
          this.startPolling();
        }
      }
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.stopPolling();
    this.timeouts.forEach(t => clearTimeout(t));
    this.timeouts = [];
  }

  private safeDetectChanges() {
    if (!this.destroyed) {
      try { this.changeDetectorRef.detectChanges(); } catch {/* ignore */ }
    }
  }

  async changeTimePeriodEventOnBTCHistoricalGraph(periodSelected: string) {
    this.startLoading();
    this.stopPolling();
    this.lineGraphInitialPeriod = periodSelected as "5min" | "15min" | "1h" | "6h" | "12h" | "1d" | "2d" | "5d" | "1m" | "2m" | "3m" | "6m" | "1y" | "2y" | "3y" | "5y" | "max";
    const hours = this.tradeService.convertTimePeriodToHours(periodSelected);
    const session = await this.inputtedParentRef.getSessionToken();
    await this.getTradebotValuesForMainGraph(this.inputtedParentRef.user?.id ?? 1, session);

    await this.coinValueService.getAllCoinValuesForGraph(new Date(), hours, this.currentSelectedCoin).then(res => {
      if (res) {
        this.allHistoricalData = res.filter((x: any) => x.name == this.lineGraphComponent.selectedCoin);
        this.allHistoricalData?.forEach(x => {
          x.valueCAD = x.valueCAD * this.latestCurrencyPriceRespectToCAD;
          if (isNaN(x.valueCAD)) {
            console.warn(`Invalid valueCAD for BTC: ${x.valueCAD}`);
            x.valueCAD = 0;
          }
        });
        if (hours <= 24) {
          this.startPolling();
        } else {
          this.timeLeft = 999;
        }
      }
      this.safeDetectChanges();
    });
    this.stopLoading();
  }
  private async getTradebotValuesForMainGraph(tradeUserId: number, sessionToken: string | undefined) {
    if (this.destroyed) return;
    const token = sessionToken ?? "";
    // Immediately clear any previous tradebot data so the UI doesn't show stale history
    // while we fetch new data for the newly selected coin.
    this.tradebotTradeValuesForMainGraph = [];
    this.tradebotBalances = [];
    // Trigger change detection so the template reflects the cleared state right away.
    try { this.safeDetectChanges(); } catch { /* noop if view not ready */ }
    const COIN_REPLACEMENTS = [
      { from: /^BTC$/i, to: 'XBT' },
      { from: /^Bitcoin$/i, to: 'XBT' },
      { from: /^Solana$/i, to: 'SOL' },
      { from: /^Dogecoin$/i, to: 'XDG' },
      { from: /^XRP$/i, to: 'XRP' },
      { from: /^Ethereum$/i, to: 'ETH' },
    ];

    let selectedCoin = this.currentSelectedCoin;
    if (selectedCoin) {
      const replacement = COIN_REPLACEMENTS.find(r => r.from.test(selectedCoin));
      selectedCoin = replacement ? replacement.to : selectedCoin;
    }
    if (!selectedCoin) {
      selectedCoin = "XBT";
    }
    if (COIN_REPLACEMENTS.some(x => x.to === selectedCoin)) {
      const period = this.lineGraphComponent.selectedPeriod;
      const hours = this.tradeService.convertTimePeriodToHours(period);

      const results = await Promise.all([
        this.tradeService.getTradeHistory(tradeUserId, token, selectedCoin, "DCA", hours),
        this.tradeService.getTradeHistory(tradeUserId, token, selectedCoin, "IND", hours),
        this.tradeService.getTradeHistory(tradeUserId, token, selectedCoin, "HFT", hours)
      ]);

      if (results.some(res => res === "Access Denied.")) {
        this.inputtedParentRef.showNotification("Access Denied (Loading coin graph).");
        return;
      }

      const [dcaRes, indRes, hftRes] = results;
      const combined = [...(dcaRes.trades ?? []), ...(indRes.trades ?? []), ...(hftRes.trades ?? [])];

      this.tradebotBalances = combined;
      if (!combined.length) {
        // Clear any previous trade values so stale data doesn't remain visible
        this.tradebotTradeValuesForMainGraph = [];
        this.tradebotBalances = [];
        // Ensure template updates after clearing
        setTimeout(() => {
          this.safeDetectChanges();
        }, 50);
        return;
      }
      this.tradebotTradeValuesForMainGraph = combined.map((x: any) => {
        const isSell = x.from_currency !== "USDC";
        const priceCAD = parseFloat(x.coin_price_cad) * this.latestCurrencyPriceRespectToCAD;
        const tradeValueCAD = x.value * priceCAD;
        return {
          timestamp: x.timestamp,
          priceCAD, // Price level of the trade
          tradeValueCAD,
          type: `${isSell ? "sell" : "buy"}_${x.strategy}`
        };
      });
    } else {
      // No tradebot data for this selection; clear any previous values
      this.tradebotTradeValuesForMainGraph = [];
      this.tradebotBalances = [];
    }

    setTimeout(() => {
      this.safeDetectChanges();
    }, 50);
  }
  startPolling() {
    // Do not start polling if the component is paused or already polling
    if (this.isPaused) return;
    if (this.pollingInterval) return;
    if (this.destroyed) return;

    this.timeLeft = this.defaultTimeLeft;
    this.pollingInterval = setInterval(async () => {
      if (this.isPaused) return; // skip ticks while paused
      this.timeLeft--;
      if (this.timeLeft == 0) {
        this.timeLeft = this.defaultTimeLeft;
        this.changeTimePeriodEventOnBTCHistoricalGraph(this.lineGraphComponent.selectedPeriod);
      } else {
        this.safeDetectChanges();
      }
    }, 1000 * 1);
  }
  stopPolling() {
    clearInterval(this.pollingInterval);
    this.pollingInterval = undefined;
  }
}
