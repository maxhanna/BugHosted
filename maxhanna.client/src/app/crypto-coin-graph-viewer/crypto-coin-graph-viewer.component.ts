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
  constructor(private coinValueService: CoinValueService, private tradeService: TradeService, private changeDetectorRef: ChangeDetectorRef) {super();}

  @Input() inputtedParentRef!: AppComponent;
  @Input() currentSelectedCoin!: string;
  @Input() selectedCurrency!: string;
  @Input() latestCurrencyPriceRespectToCAD!: number;

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
  timeLeft = 30;

  ngOnInit() { 
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['currentSelectedCoin'] && changes['currentSelectedCoin'].currentValue !== changes['currentSelectedCoin'].previousValue) {
      this.changeTimePeriodEventOnBTCHistoricalGraph(this.lineGraphInitialPeriod);
    }
  }

  ngOnDestroy(): void {
    this.stopPolling();
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
      this.changeDetectorRef.detectChanges();
    });
    this.stopLoading();
  }
  private async getTradebotValuesForMainGraph(tradeUserId: number, sessionToken: string | undefined) {
    const token = sessionToken ?? "";
    const COIN_REPLACEMENTS = [
      { from: /^BTC$/i, to: 'XBT' },
      { from: /^Bitcoin$/i, to: 'XBT' },
      { from: /^Solana$/i, to: 'SOL' },
      { from: /^Dogecoin$/i, to: 'XDG' },
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
        setTimeout(() => {
          this.changeDetectorRef.detectChanges();
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
      this.tradebotTradeValuesForMainGraph = [];
    }
    
    setTimeout(() => {
      this.changeDetectorRef.detectChanges();
    }, 50);
  }
  startPolling() {
    this.timeLeft = 30;
    this.pollingInterval = setInterval(async () => {
      this.timeLeft--;
      if (this.timeLeft == 0) {
        this.timeLeft = 30;
        this.changeTimePeriodEventOnBTCHistoricalGraph(this.lineGraphComponent.selectedPeriod);
      } else { 
        this.changeDetectorRef.detectChanges();
      }
    }, 1000 * 1)
  }
  stopPolling() {
    clearInterval(this.pollingInterval);
  }
}
