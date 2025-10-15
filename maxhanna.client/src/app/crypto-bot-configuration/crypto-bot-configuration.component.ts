import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, Output, ViewChild, AfterViewInit } from '@angular/core';
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
  // track the currently selected strategy for template bindings (avoids direct ElementRef access in templates)
  currentStrategy: string = 'DCA';
  constructor(private tradeService: TradeService, private cdRef: ChangeDetectorRef) { super(); } 

  ngAfterViewInit(): void {
    try {
      // initialize currentStrategy from the select if available
      this.currentStrategy = this.tradeStrategySelect?.nativeElement?.value ?? this.currentStrategy;
      this.detectChange();
    } catch (e) { /* ignore */ }
  }

  // return the live strategy value if possible, otherwise fallback to currentStrategy
  get selectedStrategy(): string {
    try {
      return this.tradeStrategySelect?.nativeElement?.value ?? this.currentStrategy;
    } catch {
      return this.currentStrategy;
    }
  }

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
  // Bulk edit per-coin mode
  bulkEditMode: boolean = false;
  bulkModel: Record<string, any> = {};
  strategies: string[] = ['DCA', 'IND', 'HFT'];
  coins: string[] = ['XBT', 'ETH', 'XRP', 'SOL', 'XDG'];
  savingAll: boolean = false;
  savingPerCoin: Record<string, boolean> = {};
  // store original configs fetched from server for preview/diff
  originalConfigs: Record<string, any> = {};
  previewVisible: boolean = false;
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

  // Called when checkbox toggled
  async onBulkModeToggled() {
    if (this.bulkEditMode) {
      await this.populateAllCoinsBulkModel();
    }
  }

  // Populate bulkModel for every coin using saved config if available, otherwise defaults
  async populateAllCoinsBulkModel() {
    const origFrom = this.tradeFromCoinSelect?.nativeElement?.value;
    const origStrategy = this.tradeStrategySelect?.nativeElement?.value;
    const strategy = this.tradeStrategySelect?.nativeElement?.value ?? 'DCA';
    const toCoin = this.tradeToCoinSelect?.nativeElement?.value ?? 'USDC';

    const userId = this.inputtedParentRef?.user?.id ?? this.DEFAULT_USER_ID;
    const sessionToken = (userId === this.DEFAULT_USER_ID) ? '' : (await this.inputtedParentRef?.getSessionToken() ?? '');

    for (const c of this.coins) {
      try {
        // try fetching a saved config for this user
        let cfg: any = undefined;
        try {
          cfg = await this.tradeService.getTradeConfiguration(userId, sessionToken, c, toCoin, strategy);
        } catch (err) {
          console.debug('getTradeConfiguration failed for', c, err);
          cfg = undefined;
        }

        // If server returned no usable config, try default user's config
        if (!cfg || (typeof cfg === 'string' && cfg.includes('Access Denied')) || !cfg.fromCoin) {
          try {
            const defaultCfg = await this.tradeService.getTradeConfiguration(this.DEFAULT_USER_ID, '', c, toCoin, strategy);
            if (defaultCfg && defaultCfg.fromCoin) cfg = defaultCfg;
          } catch (err) {
            // ignore
          }
        }

        if (cfg && cfg.fromCoin) {
          // map server config fields into bulkModel keys (preserve UI key naming)
          this.originalConfigs[`coin:${c}`] = cfg;
          this.bulkModel[`coin:${c}`] = {
            MaximumFromBalance: cfg.maximumFromBalance ?? cfg.maximumFromBalance ?? '',
            MinimumFromTradeAmount: cfg.minimumFromTradeAmount ?? cfg.minimumFromTradeAmount ?? '',
            MaximumToTradeAmount: cfg.maximumToTradeAmount ?? cfg.maximumToTradeAmount ?? '',
            TradeThreshold: cfg.tradeThreshold ?? cfg.tradeThreshold ?? '',
            ReserveSellPercentage: cfg.reserveSellPercentage ?? cfg.reserveSellPercentage ?? '',
            CoinReserveUSDCValue: cfg.coinReserveUSDCValue ?? cfg.coinReserveUSDCValue ?? '',
            MaxTradeTypeOccurances: cfg.maxTradeTypeOccurances ?? cfg.maxTradeTypeOccurances ?? '',
            TradeStopLoss: cfg.tradeStopLoss ?? cfg.tradeStopLoss ?? '',
            TradeStopLossPercentage: cfg.tradeStopLossPercentage ?? cfg.tradeStopLossPercentage ?? '',
            VolumeSpikeMaxTradeOccurance: cfg.volumeSpikeMaxTradeOccurance ?? cfg.volumeSpikeMaxTradeOccurance ?? ''
          };
        } else {
          // fallback to default generation using the existing default setter
          if (this.tradeFromCoinSelect) this.tradeFromCoinSelect.nativeElement.value = c;
          if (this.tradeStrategySelect) this.tradeStrategySelect.nativeElement.value = strategy;
          this.setDefaultTradeConfiguration();
          this.originalConfigs[`coin:${c}`] = null;
          this.bulkModel[`coin:${c}`] = {
            MaximumFromBalance: this.tradeMaximumFromBalance?.nativeElement?.value ?? '',
            MinimumFromTradeAmount: this.tradeMinimumFromTradeAmount?.nativeElement?.value ?? '',
            MaximumToTradeAmount: this.tradeMaximumToTradeAmount?.nativeElement?.value ?? '',
            TradeThreshold: this.tradeTradeThreshold?.nativeElement?.value ?? '',
            ReserveSellPercentage: this.tradeReserveSellPercentage?.nativeElement?.value ?? '',
            CoinReserveUSDCValue: this.tradeCoinReserveUSDCValue?.nativeElement?.value ?? '',
            MaxTradeTypeOccurances: this.tradeTradeMaximumTypeOccurances?.nativeElement?.value ?? '',
            TradeStopLoss: this.tradeStopLoss?.nativeElement?.value ?? '',
            TradeStopLossPercentage: this.tradeStopLossPercentage?.nativeElement?.value ?? '',
            VolumeSpikeMaxTradeOccurance: this.tradeVolumeSpikeMaxTradeOccurance?.nativeElement?.value ?? ''
          };
        }
      } catch (e) {
        console.warn('populateAllCoinsBulkModel failed for', c, e);
        this.bulkModel[`coin:${c}`] = this.bulkModel[`coin:${c}`] || {};
      }
    }

    // restore selection
    if (this.tradeFromCoinSelect && origFrom) this.tradeFromCoinSelect.nativeElement.value = origFrom;
    if (this.tradeStrategySelect && origStrategy) this.tradeStrategySelect.nativeElement.value = origStrategy;
    this.detectChange();
  }

  get tradeToCoinValue(): string {
    try { return this.tradeToCoinSelect?.nativeElement?.value ?? 'USDC'; } catch { return 'USDC'; }
  }

  // concurrency helper: run promise-returning tasks with limited concurrency
  private async runWithConcurrency<T>(items: T[], worker: (item: T) => Promise<any>, concurrency = 3) {
    const results: any[] = [];
    const executing: Promise<any>[] = [];
    for (const item of items) {
      const p = (async () => worker(item))();
      results.push(p);
      executing.push(p);
      if (executing.length >= concurrency) {
        await Promise.race(executing).catch(() => { /* swallow individual rejections here */ });
        // remove settled promises
        for (let i = executing.length - 1; i >= 0; --i) {
          if ((executing[i] as any).settled) executing.splice(i, 1);
        }
      }
    }
    return Promise.allSettled(results);
  }

  get totals() {
    let totalMaxFromBalance = 0;
    let totalMinPerTradeFiat = 0; // converted to fiat
    let totalMaxUSDCPerBuy = 0;
    let totalCoinReserveUSDC = 0;
    for (const c of this.coins) {
      const m = this.bulkModel[`coin:${c}`] || {};
      const maxFrom = parseFloat(m.MaximumFromBalance || '0') || 0;
      totalMaxFromBalance += maxFrom * (this.getCoinPrice(c) || 0);
      const minPer = parseFloat(m.MinimumFromTradeAmount || '0') || 0;
      totalMinPerTradeFiat += minPer * (this.getCoinPrice(c) || 0);
      totalMaxUSDCPerBuy += parseFloat(m.MaximumToTradeAmount || '0') || 0;
      totalCoinReserveUSDC += parseFloat(m.CoinReserveUSDCValue || '0') || 0;
    }
    return {
      totalMaxFromBalance,
      totalMinPerTradeFiat,
      totalMaxUSDCPerBuy,
      totalCoinReserveUSDC
    };
  }

  // Load a coin's bulk model into the main input controls so user can save it
  applyCoinModelToInputs(coin: string) {
    const model = this.bulkModel[`coin:${coin}`] || {};
    try {
      if (this.tradeFromCoinSelect) this.tradeFromCoinSelect.nativeElement.value = coin;
      if (this.tradeMaximumFromBalance) this.tradeMaximumFromBalance.nativeElement.value = model.MaximumFromBalance ?? '';
      if (this.tradeMinimumFromTradeAmount) this.tradeMinimumFromTradeAmount.nativeElement.value = model.MinimumFromTradeAmount ?? '';
      if (this.tradeMaximumToTradeAmount) this.tradeMaximumToTradeAmount.nativeElement.value = model.MaximumToTradeAmount ?? '';
      if (this.tradeTradeThreshold) this.tradeTradeThreshold.nativeElement.value = model.TradeThreshold ?? '';
      if (this.tradeReserveSellPercentage) this.tradeReserveSellPercentage.nativeElement.value = model.ReserveSellPercentage ?? '';
      if (this.tradeCoinReserveUSDCValue) this.tradeCoinReserveUSDCValue.nativeElement.value = model.CoinReserveUSDCValue ?? '';
      if (this.tradeTradeMaximumTypeOccurances) this.tradeTradeMaximumTypeOccurances.nativeElement.value = model.MaxTradeTypeOccurances ?? '';
      if (this.tradeStopLoss) this.tradeStopLoss.nativeElement.value = model.TradeStopLoss ?? '';
      if (this.tradeStopLossPercentage) this.tradeStopLossPercentage.nativeElement.value = model.TradeStopLossPercentage ?? '';
      if (this.tradeVolumeSpikeMaxTradeOccurance) this.tradeVolumeSpikeMaxTradeOccurance.nativeElement.value = model.VolumeSpikeMaxTradeOccurance ?? '';
      this.detectChange();
    } catch (e) {
      console.error('applyCoinModelToInputs failed', e);
    }
  }

  // Save a single coin/strategy from bulkModel directly
  async saveCoinModel(coin: string) {
    if (!this.inputtedParentRef?.user?.id) return alert('You must be logged in to save configurations.');
    const userId = this.inputtedParentRef.user.id;
    const sessionToken = await this.inputtedParentRef.getSessionToken();
    const toCoin = this.tradeToCoinSelect?.nativeElement?.value ?? 'USDC';
    const strategy = this.tradeStrategySelect?.nativeElement?.value ?? 'DCA';

    const model = this.bulkModel[`coin:${coin}`] || {};
    const parseNum = (v: any) => v !== null && v !== undefined && v !== '' ? parseFloat(v) : null;
    const fields: any = {
      MinimumFromTradeAmount: parseNum(model.MinimumFromTradeAmount) ?? 0,
      TradeThreshold: parseNum(model.TradeThreshold),
      MaximumToTradeAmount: parseNum(model.MaximumToTradeAmount),
      ReserveSellPercentage: parseNum(model.ReserveSellPercentage),
      CoinReserveUSDCValue: parseNum(model.CoinReserveUSDCValue) ?? 0,
      MaxTradeTypeOccurances: parseNum(model.MaxTradeTypeOccurances),
      TradeStopLoss: parseNum(model.TradeStopLoss),
      TradeStopLossPercentage: parseNum(model.TradeStopLossPercentage),
      VolumeSpikeMaxTradeOccurance: parseNum(model.VolumeSpikeMaxTradeOccurance),
      MaximumFromBalance: model.MaximumFromBalance ?? ''
    };

    const config = {
      UserId: userId,
      FromCoin: coin,
      ToCoin: toCoin,
      Strategy: strategy,
      Updated: new Date().toISOString(),
      ...fields
    };

    this.savingPerCoin[`coin:${coin}`] = true;
    try {
      const res: any = await this.tradeService.upsertTradeConfiguration(config, sessionToken);
      if (res === true || (typeof res === 'string' && res !== 'Access Denied' && !res.toLowerCase().includes('minimum trade amount'))) {
        this.inputtedParentRef?.showNotification(`Saved ${coin} (${strategy}): ${res}`);
        this.updatedTradeConfig.emit(coin);
      } else {
        this.inputtedParentRef?.showNotification(`Error saving ${coin}: ${res}`);
      }
    } catch (err: any) {
      const msg = err && (err.message || err.toString) ? (err.message ?? err.toString()) : String(err);
      this.inputtedParentRef?.showNotification(`Failed saving ${coin}: ${msg}`);
    } finally {
      this.savingPerCoin[`coin:${coin}`] = false;
    }
  }

  // Save all coins currently in bulkModel by calling upsertTradeConfiguration for each
  async saveAllBulkModels() {
    if (!this.inputtedParentRef?.user?.id) return alert('You must be logged in to save configurations.');
    if (!this.bulkEditMode) return alert('Bulk mode is not active.');

    const doConfirm = confirm('Save all coin configurations for strategy: ' + (this.tradeStrategySelect?.nativeElement?.value ?? 'DCA') + '?');
    if (!doConfirm) return;

    this.savingAll = true;
    const userId = this.inputtedParentRef.user.id;
    const sessionToken = await this.inputtedParentRef.getSessionToken();
    const toCoin = this.tradeToCoinSelect?.nativeElement?.value ?? 'USDC';
    const strategy = this.tradeStrategySelect?.nativeElement?.value ?? 'DCA';

    const items = this.coins.slice();

    const worker = async (c: string) => {
      const model = this.bulkModel[`coin:${c}`] || {};
      const parseNum = (v: any) => v !== null && v !== undefined && v !== '' ? parseFloat(v) : null;
      const fields: any = {
        MinimumFromTradeAmount: parseNum(model.MinimumFromTradeAmount) ?? 0,
        TradeThreshold: parseNum(model.TradeThreshold),
        MaximumToTradeAmount: parseNum(model.MaximumToTradeAmount),
        ReserveSellPercentage: parseNum(model.ReserveSellPercentage),
        CoinReserveUSDCValue: parseNum(model.CoinReserveUSDCValue) ?? 0,
        MaxTradeTypeOccurances: parseNum(model.MaxTradeTypeOccurances),
        TradeStopLoss: parseNum(model.TradeStopLoss),
        TradeStopLossPercentage: parseNum(model.TradeStopLossPercentage),
        VolumeSpikeMaxTradeOccurance: parseNum(model.VolumeSpikeMaxTradeOccurance),
        MaximumFromBalance: model.MaximumFromBalance ?? ''
      };

      const config = {
        UserId: userId,
        FromCoin: c,
        ToCoin: toCoin,
        Strategy: strategy,
        Updated: new Date().toISOString(),
        ...fields
      };

      try {
        const res: any = await this.tradeService.upsertTradeConfiguration(config, sessionToken);
        if (res === true || (typeof res === 'string' && res !== 'Access Denied' && !res.toLowerCase().includes('minimum trade amount'))) {
          this.inputtedParentRef?.showNotification(`Saved ${c} (${strategy}): ${res}`);
          this.updatedTradeConfig.emit(c);
          return { coin: c, ok: true, message: res };
        } else {
          this.inputtedParentRef?.showNotification(`Error saving ${c}: ${res}`);
          return { coin: c, ok: false, message: res };
        }
      } catch (err: any) {
        console.error('saveAllBulkModels error for', c, err);
        const msg = err && (err.message || err.toString) ? (err.message ?? err.toString()) : String(err);
        this.inputtedParentRef?.showNotification(`Failed saving ${c}: ${msg}`);
        return { coin: c, ok: false, message: msg };
      }
    };

    const settled = await this.runWithConcurrency(items, worker, 3);
    this.savingAll = false;
    const failed = settled.filter((r: any) => r.status === 'rejected' || (r.status === 'fulfilled' && r.value && !r.value.ok));
    if (failed.length === 0) {
      this.inputtedParentRef?.showNotification('Save all completed successfully.');
    } else {
      this.inputtedParentRef?.showNotification(`Save all completed with ${failed.length} failures.`);
    }
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
    // sync local property (keeps template conditionals consistent)
    try { this.currentStrategy = this.tradeStrategySelect?.nativeElement?.value ?? this.currentStrategy; } catch { }
    this.getTradeConfiguration();
    if (this.bulkEditMode) {
      // refresh bulk models to reflect strategy-specific defaults
      this.populateAllCoinsBulkModel();
    }
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
