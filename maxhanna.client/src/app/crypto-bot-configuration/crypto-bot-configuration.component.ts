import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { AppComponent } from '../app.component';
import { TradeService } from '../../services/trade.service';
import { ChildComponent } from '../child.component';
import { e } from '@angular/core/weak_ref.d-Bp6cSy-X';

@Component({
  selector: 'app-crypto-bot-configuration',
  standalone: false,
  templateUrl: './crypto-bot-configuration.component.html',
  styleUrl: './crypto-bot-configuration.component.css'
})
export class CryptoBotConfigurationComponent extends ChildComponent {
  bulkEditMode: boolean = false;
  coins: string[] = ['XBT','ETH','XRP','SOL','XDG'];
  bulkModel: Record<string, any> = {};
  savingAll: boolean = false;
  savingPerCoin: Record<string, boolean> = {};
  bulkStrategy: string = 'DCA';
  perRowStatus: Record<string, string> = {};
  totalToSave: number = 0;
  savedCount: number = 0;
  constructor(private tradeService: TradeService, private cdRef: ChangeDetectorRef) { super(); } 

  @Input() inputtedParentRef?: AppComponent;
  @Input() btcToCadPrice?: number;
  @Input() ethToCadPrice?: number;
  @Input() xrpToCadPrice?: number;
  @Input() xdgToCadPrice?: number;
  @Input() solToCadPrice?: number;
  @Input() selectedCurrency?: string;
  @Output() updatedTradeConfig = new EventEmitter<string>();
  @Output() closeEventEmitter = new EventEmitter<void>();

  @ViewChild('tradeFromCoinSelect') tradeFromCoinSelect?: ElementRef<HTMLSelectElement>;
  @ViewChild('tradeStrategySelect') tradeStrategySelect!: ElementRef<HTMLSelectElement>;
  @ViewChild('tradeToCoinSelect') tradeToCoinSelect!: ElementRef<HTMLSelectElement>;
  @ViewChild('tradeMaximumToTradeAmount') tradeMaximumToTradeAmount!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeMinimumFromTradeAmount') tradeMinimumFromTradeAmount!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeMinimumToTradeAmount') tradeMinimumToTradeAmount!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeTradeThreshold') tradeTradeThreshold!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeReserveSellPercentage') tradeReserveSellPercentage!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeCoinReserveUSDCValue') tradeCoinReserveUSDCValue!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeTradeMaximumTypeOccurances') tradeTradeMaximumTypeOccurances!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeStopLoss') tradeStopLoss!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeStopLossPercentage') tradeStopLossPercentage!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeVolumeSpikeMaxTradeOccurance') tradeVolumeSpikeMaxTradeOccurance!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeMaximumFromBalance') tradeMaximumFromBalance!: ElementRef<HTMLInputElement>;

  tradeConfigLastUpdated: Date | undefined = undefined;
  private readonly DEFAULT_USER_ID = 1;

  async updateCoinConfiguration() {
    if (!this.inputtedParentRef?.user?.id) {
      return alert("You must be logged in to save your configuration.");
    }

    const getVal = (el?: ElementRef) => el?.nativeElement?.value.toString().trim() ?? "XBT";
    const parseNum = (val: string | null) => val !== null && val !== '' ? parseFloat(val) : null;

    const fromCoin = getVal(this.tradeFromCoinSelect);
    const toCoin = getVal(this.tradeToCoinSelect);
    const strategy = getVal(this.tradeStrategySelect);

    if (!fromCoin) return alert("Invalid 'From' coin.");
    if (!toCoin) return alert("Invalid 'To' coin."); 
 
    const coinReserveUSDCValue = parseNum(getVal(this.tradeCoinReserveUSDCValue)) ?? 0;
    if (coinReserveUSDCValue < 5 && strategy != "HFT") {
      return alert(`Coin Reserve must be greater than 5$.`);
    }
    const maxFromBalance = getVal(this.tradeMaximumFromBalance);
    if (!maxFromBalance || isNaN(parseFloat(maxFromBalance))) {
      return alert(`Invalid 'Maximum ${this.normalizeCoinName(fromCoin)} Balance' value. Set value to 0 to disable.`);
    }

    const sellPercOfReserveValue = this.TradeReserveSellPercentUSDValue;
    if (sellPercOfReserveValue < 5 && strategy != "HFT") {
      return alert(`Reserve Sell Percentage must be worth more than 5$USD.`);
    }


    const fields = {
      MinimumFromTradeAmount: parseNum(getVal(this.tradeMinimumFromTradeAmount)) ?? 0,
      TradeThreshold: parseNum(getVal(this.tradeTradeThreshold)),
      MaximumToTradeAmount: parseNum(getVal(this.tradeMaximumToTradeAmount)),
      ReserveSellPercentage: parseNum(getVal(this.tradeReserveSellPercentage)),
      CoinReserveUSDCValue: coinReserveUSDCValue,
      MaxTradeTypeOccurances: parseNum(getVal(this.tradeTradeMaximumTypeOccurances)),
      TradeStopLoss: parseNum(getVal(this.tradeStopLoss)),
      TradeStopLossPercentage: parseNum(getVal(this.tradeStopLossPercentage)),
      VolumeSpikeMaxTradeOccurance: parseNum(getVal(this.tradeVolumeSpikeMaxTradeOccurance)),
      MaximumFromBalance: maxFromBalance,
    };

    const invalidField = Object.entries(fields).find(([key, val]) => val === null || isNaN(val));
    if (invalidField) {
      return alert(`Invalid value for '${invalidField[0]}'.`);
    }
    if ((fields?.TradeStopLossPercentage ?? 0) <= 0 && strategy == "IND") {
      return alert(`Invalid value for 'TradeStopLossPercentage'. Value must be above 0.`);
    }

    const config = {
      UserId: this.inputtedParentRef.user.id,
      FromCoin: fromCoin,
      ToCoin: toCoin,
      Strategy: strategy,
      Updated: new Date().toISOString(),
      ...fields
    };

    const sessionToken = await this.inputtedParentRef.getSessionToken();
    this.tradeService.upsertTradeConfiguration(config, sessionToken)
      .then((result: any) => {
        if (result === true || (typeof result === "string" && result !== "Access Denied" && !result.toLowerCase().includes("minimum trade amount"))) {
          this.inputtedParentRef?.showNotification(`Updated (${fromCoin}|${toCoin}:${strategy}) configuration: ${result}`);
          this.updatedTradeConfig.emit(fromCoin);
          this.tradeConfigLastUpdated = new Date();
        } else if (result) {
          this.inputtedParentRef?.showNotification(`Error updating (${fromCoin}|${toCoin}:${strategy}): ${result}`);
        } else {
          this.inputtedParentRef?.showNotification(`Error updating (${fromCoin}|${toCoin}:${strategy}).`); 
        }
      })
      .catch((err: any) => {
        console.error("Update config failed:", err);
        const message = err?.message === "Access Denied"
          ? "Access Denied. Please re-login."
          : "Failed to update configuration.";
        this.inputtedParentRef?.showNotification(message);
      });
  }

  getCoinPrice(coin?: string) {
    if (!coin) return 0;
    if (coin == "XBT" || coin == "BTC" || coin == "Bitcoin") {
      return this.btcToCadPrice ?? 0;
    } else if (coin == "ETH" || coin == "Ethereum") {
      return this.ethToCadPrice ?? 0;
    } else if (coin == "XRP") {
      return this.xrpToCadPrice ?? 0;
    } else if (coin == "XDG" || coin == "Dogecoin") {
      return this.xdgToCadPrice ?? 0;
    } else if (coin == "SOL" || coin == "Solana") {
      return this.solToCadPrice ?? 0;
    }
    return 0;
  }

  get MaxFromBalanceEnteredPrice() {
    return parseFloat(this.tradeMaximumFromBalance?.nativeElement?.value || '1') * this.getCoinPrice(this.tradeFromCoinSelect?.nativeElement?.value ?? '0');
  } 

  get MinFromTradeEnteredPrice() {
    return parseFloat(this.tradeMinimumFromTradeAmount?.nativeElement?.value || '1') * this.getCoinPrice(this.tradeFromCoinSelect?.nativeElement?.value ?? '0');
  }

  get TradeReserveSellPercentUSDValue() {
    return parseFloat(this.tradeReserveSellPercentage?.nativeElement?.value || '1') * parseFloat(this.tradeCoinReserveUSDCValue?.nativeElement?.value ?? '0');
  }
  
  detectChange() { 
    this.cdRef.detectChanges();    
  }

  async getTradeConfiguration() {
    this.tradeConfigLastUpdated = undefined;
    const userId = this.inputtedParentRef?.user?.id;
    const sessionToken = await this.inputtedParentRef?.getSessionToken();
    if (!userId || !sessionToken) { return alert("You must be logged in to get settings."); }
    const fromCoin = this.tradeFromCoinSelect?.nativeElement?.value ?? "BTC";
    const toCoin = this.tradeToCoinSelect?.nativeElement?.value ?? "USDC";
    const strategy = this.tradeStrategySelect?.nativeElement?.value ?? "DCA";
    this.applyTradeConfiguration(undefined, true);
    const tv = await this.tradeService.getTradeConfiguration(userId, sessionToken, fromCoin, toCoin, strategy);
    if (tv?.userId) {
      this.applyTradeConfiguration(tv);
    } else {
      // If current user doesn't have a config, try to get default config from user 1
      const defaultSessionToken = "";
      const defaultConfig = await this.tradeService.getTradeConfiguration(
        this.DEFAULT_USER_ID,
        defaultSessionToken,
        fromCoin,
        toCoin,
        strategy
      );
      console.log(defaultConfig);
      if (defaultConfig && defaultConfig.fromCoin) {
        this.applyTradeConfiguration(defaultConfig, true);
      } else if (defaultConfig && defaultConfig.includes("Access Denied")) {
        this.inputtedParentRef?.showNotification(`Error getting (${fromCoin}|${toCoin}:${strategy}) configuration: ${defaultConfig}`); 
        this.closeEventEmitter.emit();
        return;
      } else { this.setDefaultTradeConfiguration(); } 
    }
  }

  private applyTradeConfiguration(config: any, removeUserSpecificData = false) {
    // Default values (modify these as needed)
    const defaults = {
      tradeThreshold: 0,
      minimumFromTradeAmount: 0,
      maximumToTradeAmount: 0,
      reserveSellPercentage: 0,
      coinReserveUSDCValue: 0,
      maxTradeTypeOccurances: 0,
      volumeSpikeMaxTradeOccurance: 0,
      maximumFromBalance: 0,
      tradeStopLoss: 0,
      tradeStopLossPercentage: 0,
      updated: new Date() // Default last updated time
    };

    // Use config if provided, otherwise use defaults
    const effectiveConfig = config || defaults;

    // Apply values
    this.tradeTradeThreshold.nativeElement.valueAsNumber = effectiveConfig.tradeThreshold;
    this.tradeMinimumFromTradeAmount.nativeElement.valueAsNumber = effectiveConfig.minimumFromTradeAmount;
    this.tradeMaximumToTradeAmount.nativeElement.valueAsNumber = effectiveConfig.maximumToTradeAmount;
    this.tradeReserveSellPercentage.nativeElement.valueAsNumber = effectiveConfig.reserveSellPercentage;
    this.tradeCoinReserveUSDCValue.nativeElement.valueAsNumber = effectiveConfig.coinReserveUSDCValue;
    this.tradeTradeMaximumTypeOccurances.nativeElement.valueAsNumber = effectiveConfig.maxTradeTypeOccurances;
    this.tradeVolumeSpikeMaxTradeOccurance.nativeElement.valueAsNumber = effectiveConfig.volumeSpikeMaxTradeOccurance;
    this.tradeMaximumFromBalance.nativeElement.valueAsNumber = effectiveConfig.maximumFromBalance;
    this.tradeStopLoss.nativeElement.valueAsNumber = effectiveConfig.tradeStopLoss;
    this.tradeStopLossPercentage.nativeElement.valueAsNumber = effectiveConfig.tradeStopLossPercentage;

    if (!removeUserSpecificData) {
      this.tradeConfigLastUpdated = effectiveConfig.updated;
    }
  }

  setDefaultTradeConfiguration() {
    this.tradeConfigLastUpdated = undefined;
    const selectedStrategy = this.tradeStrategySelect.nativeElement.value ?? "DCA";
    // Set common defaults
    if (selectedStrategy != "HFT") { 
      this.tradeTradeMaximumTypeOccurances.nativeElement.valueAsNumber = 5;
      this.tradeStopLoss.nativeElement.valueAsNumber = 0;
      this.tradeStopLossPercentage.nativeElement.valueAsNumber = 0.5;
      this.tradeVolumeSpikeMaxTradeOccurance.nativeElement.valueAsNumber = 1;
      this.tradeMaximumToTradeAmount.nativeElement.valueAsNumber = 2000;
      this.tradeReserveSellPercentage.nativeElement.valueAsNumber = 0.075;
    }
    this.tradeTradeThreshold.nativeElement.valueAsNumber = 0.0085;

    // Set coin-specific defaults
    const fromCoin = this.tradeFromCoinSelect?.nativeElement?.value ?? "XBT";
    const toCoin = this.tradeToCoinSelect.nativeElement.value;

    if (fromCoin === "XBT" && toCoin === "USDC") {
      this.tradeMinimumFromTradeAmount.nativeElement.valueAsNumber = 0.00005;
      this.tradeCoinReserveUSDCValue.nativeElement.valueAsNumber = 200;
    } else if (fromCoin === "XRP" && toCoin === "USDC") {
      this.tradeMinimumFromTradeAmount.nativeElement.valueAsNumber = 2;
      this.tradeCoinReserveUSDCValue.nativeElement.valueAsNumber = 25;
    } else if (fromCoin === "SOL" && toCoin === "USDC") {
      this.tradeMinimumFromTradeAmount.nativeElement.valueAsNumber = 0.02;
      this.tradeCoinReserveUSDCValue.nativeElement.valueAsNumber = 50;
    } else if (fromCoin === "XDG" && toCoin === "USDC") {
      this.tradeMinimumFromTradeAmount.nativeElement.valueAsNumber = 25;
      this.tradeCoinReserveUSDCValue.nativeElement.valueAsNumber = 25;
    } else if (fromCoin === "ETH" && toCoin === "USDC") {
      this.tradeMinimumFromTradeAmount.nativeElement.valueAsNumber = 0.0015;
      this.tradeCoinReserveUSDCValue.nativeElement.valueAsNumber = 200;
    } else {
      // Default fallback values
      this.tradeMinimumFromTradeAmount.nativeElement.valueAsNumber = 0.00005;
      this.tradeCoinReserveUSDCValue.nativeElement.valueAsNumber = 200;
    }
    if (selectedStrategy == "HFT") { 
      this.tradeCoinReserveUSDCValue.nativeElement.valueAsNumber = 0;
    }
  }

  tradeFromCoinSelectChange() {
    this.getTradeConfiguration();
  }

  tradeStrategySelectChange() {
    this.getTradeConfiguration();
  }

  toggleBulkEdit(event: Event) {
    const target = event.target as HTMLInputElement;
    this.bulkEditMode = !!target?.checked;
  }

  toggleExplanation(event: Event) {
    const target = event.currentTarget as HTMLElement;
    const explanation = target.closest('.config-box')?.querySelector('.config-explanation');

    if (explanation) {
      explanation.classList.toggle('expanded');

      // Rotate the info icon when expanded
      const icon = target.querySelector('.info-icon');
      if (icon) {
        if (explanation.classList.contains('expanded')) {
          icon.classList.add('expanded');
        } else {
          icon.classList.remove('expanded');
        }
      }
    }
  }
  async populateAllCoinsBulkModel() {
    // Load defaults for each coin into bulkModel
    for (const c of this.coins) {
      this.bulkModel['coin:' + c] = {
        MaximumFromBalance: 0,
        MinimumFromTradeAmount: 0,
        MaximumToTradeAmount: 0,
        CoinReserveUSDCValue: 0,
        FromCoin: c,
        ToCoin: 'USDC',
        Strategy: this.tradeStrategySelect?.nativeElement?.value ?? 'DCA'
      };
    }
  // initialize per-row status
  for (const c of this.coins) { this.perRowStatus[c] = ''; }
  this.detectChange();
  }

  async saveCoinModel(coin: string) {
    const key = 'coin:' + coin;
    const model = this.bulkModel[key];
    if (!model) return;
    this.savingPerCoin[coin] = true;
  this.perRowStatus[coin] = 'saving';
    try {
  const sessionToken = await this.inputtedParentRef?.getSessionToken();
  if (!sessionToken) { alert('You must be logged in to save configurations.'); return; }
  const config = {
        UserId: this.inputtedParentRef?.user?.id,
        FromCoin: model.FromCoin,
        ToCoin: model.ToCoin,
        Strategy: model.Strategy,
        MinimumFromTradeAmount: parseFloat(model.MinimumFromTradeAmount || 0),
        MaximumToTradeAmount: parseFloat(model.MaximumToTradeAmount || 0),
        CoinReserveUSDCValue: parseFloat(model.CoinReserveUSDCValue || 0),
        MaximumFromBalance: parseFloat(model.MaximumFromBalance || 0),
        Updated: new Date().toISOString()
      };
      await this.tradeService.upsertTradeConfiguration(config, sessionToken);
      this.inputtedParentRef?.showNotification(`Saved ${coin}`);
      this.perRowStatus[coin] = 'saved';
    } catch (err) {
      console.error(err);
      this.inputtedParentRef?.showNotification(`Failed to save ${coin}`);
      this.perRowStatus[coin] = 'error';
    }
    this.savingPerCoin[coin] = false;
  }

  async saveAllBulkModels() {
    const keys = Object.keys(this.bulkModel).filter(k => k.startsWith('coin:'));
    if (!keys.length) return alert('No coins loaded. Click Load Coins first.');
    if (!confirm('Save all coin configurations?')) return;
    this.savingAll = true;
    this.totalToSave = keys.length;
    this.savedCount = 0;

    const items = keys.map(k => k.replace('coin:', ''));
    const worker = async (coin: string) => {
      await this.saveCoinModel(coin);
      this.savedCount++;
    };

    await this.runWithConcurrency(items, worker, 3);
    this.savingAll = false;
  }

  async runWithConcurrency<T>(items: T[], worker: (item: T) => Promise<void>, concurrency: number) {
    return new Promise<void>((resolve) => {
      let index = 0;
      let active = 0;
      const next = () => {
        if (index >= items.length && active === 0) return resolve();
        while (active < concurrency && index < items.length) {
          const item = items[index++];
          active++;
          worker(item).catch(() => {}).finally(() => {
            active--;
            next();
          });
        }
      };
      next();
    });
  }
  multiplyBy100(value: string) {
    if (!value) return 0;
    return parseFloat(value) * 100;
  }
  normalizeCoinName(coin?: string) {
    if (coin == "XBT") {
      return "Bitcoin";
    }
    if (coin == "XDG") {
      return "Dogecoin";
    }
    if (coin == "SOL") {
      return "Solana";
    }
    if (coin == "ETH") {
      return "Ethereum";
    }
    return coin;
  }
  getMinimumCryptoAmount(coinSymbol: string, minFiatAmount: number = 5): number {
    const priceMap: Record<string, number | undefined> = {
      btc: this.btcToCadPrice,
      xbt: this.btcToCadPrice,
      eth: this.ethToCadPrice,
      ethereum: this.ethToCadPrice,
      xrp: this.xrpToCadPrice,
      xdg: this.xdgToCadPrice,
      dogecoin: this.xdgToCadPrice,
      sol: this.solToCadPrice,
      solana: this.solToCadPrice
    };

    const coinPrice = priceMap[coinSymbol.toLowerCase()];

    if (!coinPrice || coinPrice <= 0) return 0; // Handle missing/negative prices

    const cryptoAmount = minFiatAmount / coinPrice;
    return parseFloat(cryptoAmount.toFixed(8)); // Standard crypto precision
  }
}
