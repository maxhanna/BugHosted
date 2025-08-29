import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { Currency, MiningWalletResponse } from '../../services/datacontracts/crypto/mining-wallet-response';
import { CoinValue } from '../../services/datacontracts/crypto/coin-value';
import { ExchangeRate } from '../../services/datacontracts/crypto/exchange-rate';
import { LineGraphComponent } from '../line-graph/line-graph.component';
import { CoinValueService } from '../../services/coin-value.service';
import { MiningRigsComponent } from '../mining-rigs/mining-rigs.component';
import { AiService } from '../../services/ai.service';
import { TradeService } from '../../services/trade.service';
import { ProfitData } from '../../services/datacontracts/trade/profit-data';
import { CryptoBotConfigurationComponent } from '../crypto-bot-configuration/crypto-bot-configuration.component';
import { CryptoMarketCapsComponent } from '../crypto-market-caps/crypto-market-caps.component'; 
import { CryptoCoinGraphViewerComponent } from '../crypto-coin-graph-viewer/crypto-coin-graph-viewer.component';


@Component({
  selector: 'app-crypto-hub',
  templateUrl: './crypto-hub.component.html',
  styleUrl: './crypto-hub.component.css',
  standalone: false
})
export class CryptoHubComponent extends ChildComponent implements OnInit, OnDestroy {
  wallet?: MiningWalletResponse[] | undefined;
  btcFiatConversion?: number = 0;
  selectedCurrency?: string = undefined;
  selectedFiatConversionName?: string = "USD";
  selectedCoinConversionName: string = "BTC";
  profitData: ProfitData[] = [];
  noMining = false;
  isDiscreete = false;
  latestCoinValueData?: CoinValue[];
  totalBTCVolume: number = 0;
  totalUSDCVolume: number = 0;
  btcVolumePercentage: number = 0;
  usdcVolumePercentage: number = 0;
  volumeDisplayData?: VolumeDisplayData;
  allWalletBalanceData?: CoinValue[] = [];
  allHistoricalExchangeRateData?: ExchangeRate[] = [];
  allHistoricalExchangeRateDataForGraph?: ExchangeRate[] = [];
  fiatNames: string[] = [];
  coinNames: string[] = [];
  btcToCadPrice = 0;
  solToCadPrice = 0;
  xdgToCadPrice = 0;
  xrpToCadPrice = 0;
  ethToCadPrice = 0;
  selectedCoinToCadPrice = 0;
  isMenuPanelOpen = false;
  isWalletPanelOpen = false;
  latestCurrencyPriceRespectToCAD = 0;
  latestCurrencyPriceRespectToFIAT = 0;
  currentlySelectedCurrency?: Currency = undefined;
  finishedGeneratingAiMessage = false;
  finishedGeneratingAiWalletMessage = false;
  generalAiMessage = "";
  aiMessages: { addr: string, message: string }[] = [];
  hideHostAiMessageWallet = true;
  hideHostAiMessage = true;
  isGraphFullscreenedInPopup = false;
  hostAiToggled = false;
  hasKrakenApi = false;
  showingTradeSettings = false;
  showingTradeLogs = false;
  isTradePanelOpen = false;
  isShowingTradeValueGraph = false;
  tradeConfigLastUpdated?: Date = undefined;
  hasAnyTradeConfig = false;
  fullscreenTimeout = false;
  isTradeInformationOpen = false;
  isShowingTradeSimulator = false;
  isShowingTradeProfit = false;
  showMacdHelp = false;
  tradeIndicators?: IndicatorData;
  firstLoadTradeBalance = false;
  openProfitSections: { [key: string]: boolean } = {
    days: false,
    weeks: false,
    months: false
  };
  private exchangeRateCache = new Map<string, {
    baseRates: ExchangeRate[];
    targetRates: ExchangeRate[];
    baseTimestamps: number[];
    targetTimestamps: number[];
  }>();
  isDragging = false;
  private scheduledFrame: number | null = null;
  private pendingMarqueeScrollLeft: number = 0;
  marqueeStartX = 0;
  marqueeScrollLeft = 0;
  private marqueeScrollId?: number;
  private marqueeScrollSpeed = 0.75;
  private defaultMarqueeScrollSpeed = 0.75;
  isTradebotBalanceShowing = false;
  isTradeLiveViewShowing = false;
  allHistoricalTradeSimData?: CoinValue[] = [];
  activeTradeBots?: { strategy: string, currency: string, startedSince: string }[] = undefined;


  latestTradebotBalance?: {
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
  } = undefined;
  tradebotValuesForGraph: any;
  exchangeRateGraphSelectedPeriod: '5min' | '15min' | '1h' | '6h' | '12h' | '1d' | '2d' | '5d' | '1m' | '2m' | '3m' | '6m' | '1y' | '2y' | '3y' | '5y' | 'max' = '1y'
  tradebotSimulationGraphData: any[] = [];
  tradebotSimulationGraphData2: any[] = [];
  tradeSimParams = {
    initialBtc: 0.02085,               // Starting BTC amount
    initialUsd: 1000,           // Starting USD amount
    tradeThreshold: 0.0085,       // 0.85% threshold for trades
    tradePercentage: 0.15,       // Trade 15% of balance
    maxBtcTrade: 0.005,          // Max 0.005 BTC per trade
    minBtcTrade: 0.00005,        // Min 0.00005 BTC per trade
    cooldownMinutes: 15,         // 15 min between trades
    fee: 0.004                   // 0.4% fee
  };
  tradeBotSimDebug: string[] = [];
  useRandomPriceGraph = false;
  cadToUsdRate?: number;
  btcUSDRate?: number;
  selectedCoinUSDRate?: number;
  usdToSelectedCurrencyRate?: number;
  cadToSelectedCurrencyRate?: number;
  lastTradePercentage = 0;
  globalCryptoStats?: any = undefined;
  indicatorCache = new Map<string, IndicatorData>(); 
  private singleLineLogInterval: any;
  lastTradebotTrade: any;
  periodTypes = [
    { key: 'days', label: 'Daily Performance', periodKey: 'daily' },
    { key: 'weeks', label: 'Weekly Performance', periodKey: 'weekly' },
    { key: 'months', label: 'Monthly Performance', periodKey: 'monthly' }
  ];
  tradeBotStatus: { [key: string]: { [strategy: string]: boolean } } = {
    BTC: { DCA: false, IND: false, HFT: false },
    XRP: { DCA: false, IND: false, HFT: false },
    SOL: { DCA: false, IND: false, HFT: false },
    XDG: { DCA: false, IND: false, HFT: false },
    ETH: { DCA: false, IND: false, HFT: false }
  };
  tradeBotStartedSince: { [key: string]: { [strategy: string]: Date | undefined } } = {
    BTC: { DCA: undefined, IND: undefined, HFT: undefined },
    XRP: { DCA: undefined, IND: undefined, HFT: undefined },
    SOL: { DCA: undefined, IND: undefined, HFT: undefined },
    XDG: { DCA: undefined, IND: undefined, HFT: undefined },
    ETH: { DCA: undefined, IND: undefined, HFT: undefined }
  };
  marketSentimentData?: any;
  isMarketSentimentMaximized = false;
  readonly sentimentPageSize = this.onMobile() ? 3 : 5;
  currentSentimentPage = 1;
  availableIndicatorPairs = [
    { value: 'BTC/USDC', display: 'BTC/USDC', fromCoin: 'XBT', fromCoinLongName: 'Bitcoin', toCoin: 'USDC' },
    { value: 'ETH/USDC', display: 'ETH/USDC', fromCoin: 'ETH', fromCoinLongName: 'Ethereum', toCoin: 'USDC' },
    { value: 'XRP/USDC', display: 'XRP/USDC', fromCoin: 'XRP', fromCoinLongName: 'XRP', toCoin: 'USDC' },
    { value: 'DOGE/USDC', display: 'DOGE/USDC', fromCoin: 'XDG', fromCoinLongName: 'Dogecoin', toCoin: 'USDC' },
    { value: 'SOL/USDC', display: 'SOL/USDC', fromCoin: 'SOL', fromCoinLongName: 'Solana', toCoin: 'USDC' }
  ];
  selectedIndicatorPair = 'BTC/USDC';
  bullishCoins: string[] = [];
  isMacdPopupOpen = false;
  macdGraphData: any[] = [];
  selectedTradeBalanceId?: number;
  lastLogEntry?: string = undefined;
  private conversionLock = false;
  private currentRates = {
    coin: { valueCAD: 0 },
    fiatToCAD: 1,
    currencyToCAD: 1
  };
  isDataToolVisible: Record<ToolKey, boolean> = {
    profit: false,
    graph: false,
    sim: false
  };
  numberOfTrades?: number = undefined;

  @ViewChild('scrollContainer', { static: true }) scrollContainer!: ElementRef;
  @ViewChild(CryptoCoinGraphViewerComponent) coinGraphViewer!: CryptoCoinGraphViewerComponent;
  @ViewChild(LineGraphComponent) simLineGraph!: LineGraphComponent;
  @ViewChild(LineGraphComponent) currencyExchangeLineGraph!: LineGraphComponent;
  @ViewChild(CryptoBotConfigurationComponent) configurationComponent!: CryptoBotConfigurationComponent;
  @ViewChild(CryptoMarketCapsComponent) cryptoMarketCapsComponent!: CryptoMarketCapsComponent;
  @ViewChild('miningRigComponent') miningRigComponent!: MiningRigsComponent;
  @ViewChild('convertSATInput') convertSATInput!: ElementRef<HTMLInputElement>;
  @ViewChild('convertCurrencyInput') convertCurrencyInput!: ElementRef<HTMLInputElement>;
  @ViewChild('convertBTCInput') convertBTCInput!: ElementRef<HTMLInputElement>;
  @ViewChild('convertFIATInput') convertFIATInput!: ElementRef<HTMLInputElement>;
  @ViewChild('btcConvertFIATSelect') btcConvertFIATSelect!: ElementRef<HTMLSelectElement>;
  @ViewChild('btcConvertCoinSelect') btcConvertCoinSelect!: ElementRef<HTMLSelectElement>;
  @ViewChild('toolSelect') toolSelect?: ElementRef<HTMLSelectElement>;
  @ViewChild('selectedCurrencyDropdown') selectedCurrencyDropdown!: ElementRef<HTMLSelectElement>;
  @ViewChild('selectedTradebotCurrency') selectedTradebotCurrency?: ElementRef<HTMLSelectElement>;
  @ViewChild('selectedTradebotStrategy') selectedTradebotStrategy?: ElementRef<HTMLSelectElement>;
  @ViewChild('tradeIndicatorSelect') tradeIndicatorSelect!: ElementRef<HTMLSelectElement>;
  @ViewChild('tradeBotSimDebugDivContainer') tradeBotSimDebugDivContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('initialBtcUsd') initialBtcUsd!: ElementRef<HTMLInputElement>;
  @ViewChild('initialUsdc') initialUsdc!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeSpreadPct') tradeSpreadPct!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeFeePct') tradeFeePct!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeAmountPct') tradeAmountPct!: ElementRef<HTMLInputElement>;

  @Input() currentSelectedCoin: string = 'Bitcoin';
  @Output() coinSelected = new EventEmitter<string>();
  constructor(
    private coinValueService: CoinValueService,
    private aiService: AiService,
    private tradeService: TradeService,
    private changeDetectorRef: ChangeDetectorRef,) {
    super();
  }
  async ngOnInit() {
    this.startLoading();
    try {
      this.parentRef?.addResizeListener();
      this.startSingleLineLogPolling();
      await this.getUserCurrency();
      this.getCurrencyNames();
      await this.coinValueService.getLatestCoinValues().then((res: CoinValue[]) => {
        // Process Bitcoin data
        this.processLatestCoinValuesForMarqueeAndConversion(res);
      });

      this.getIsTradebotStarted();
      this.getExchangeRateData();
      await this.getKrakenApiInfo();
      await this.getLatestCurrencyPriceRespectToCAD();
      await this.getLatestCurrencyPriceRespectToFIAT();  
      this.coinValueService.getCurrencyToCadRate("usd").then(res => {
        this.cadToUsdRate = res;
        this.btcUSDRate = this.btcToCadPrice / this.cadToUsdRate;
        this.selectedCoinUSDRate = this.selectedCoinToCadPrice / this.cadToUsdRate;
        setTimeout(() => {
          this.getLastTradebotTradeDisplay().then(() => this.getLastTradePercentage());
        }, 50);
      });
      this.coinValueService.getGlobalMetrics().then(res => {
        this.globalCryptoStats = res;
      });
      this.loadIndicators('XBT');
      this.aiService.getMarketSentiment().then(res => {
        if (res) {
          this.marketSentimentData = res;
        }
      });
      if (this.currentSelectedCoin && this.currentSelectedCoin != "Bitcoin") {
        setTimeout(() => {
          console.log("selecting coin : ", this.currentSelectedCoin);
          this.selectCoin(this.currentSelectedCoin);
        }, 1000);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    }
    this.stopLoading();
  }
  private processLatestCoinValuesForMarqueeAndConversion(res: CoinValue[]) {
    const bitcoinData = res.find(x => x.name === "Bitcoin");
    if (bitcoinData) {
      this.btcToCadPrice = bitcoinData.valueCAD;
      this.selectedCoinToCadPrice = bitcoinData.valueCAD;
      if (bitcoinData.valueCAD && !this.btcFiatConversion) {
        this.btcFiatConversion = bitcoinData.valueCAD;
      }
      this.handleConversion('BTC');
    }
    const solData = res.find(x => x.name === "Solana");
    if (solData) {
      this.solToCadPrice = solData.valueCAD;
    }
    const xrpData = res.find(x => x.name === "XRP");
    if (xrpData) {
      this.xrpToCadPrice = xrpData.valueCAD;
    }
    const xdgData = res.find(x => x.name === "Dogecoin");
    if (xdgData) {
      this.xdgToCadPrice = xdgData.valueCAD;
    }
    const ethData = res.find(x => x.name === "Ethereum");
    if (ethData) {
      this.ethToCadPrice = ethData.valueCAD;
    }

    // Process all coin data
    this.latestCoinValueData = res;
    this.coinNames = res.map(x => x.name.replace("Bitcoin", "BTC"))
      .filter((name, index, arr) => arr.indexOf(name) === index)
      .sort();
    this.startAutoScroll();
  }

  private getProfitData(tradeUserId: number, sessionToken: string | undefined) {
    if (this.profitData && this.profitData.length > 0) {
      return;
    }
    this.tradeService.getProfitData(tradeUserId, 100, sessionToken ?? "").then(res => {
      if (res) {
        this.profitData = res;
      }
    });
  }

  private async getLatestCurrencyPriceRespectToFIAT() {
    const ceRes2 = await this.coinValueService.getLatestCurrencyValuesByName(this.selectedFiatConversionName) as ExchangeRate;
    if (ceRes2) {
      this.latestCurrencyPriceRespectToFIAT = ceRes2.rate;
    }
  }

  private async getLatestCurrencyPriceRespectToCAD() {
    const ceRes = await this.coinValueService.getLatestCurrencyValuesByName(this.selectedCurrency) as ExchangeRate;
    if (ceRes) {
      this.latestCurrencyPriceRespectToCAD = ceRes.rate;
    }
  }

  private async getKrakenApiInfo() {
    if (this.parentRef?.user?.id) {
      await this.tradeService.hasApiKey(this.parentRef.user.id).then(res => {
        this.hasKrakenApi = res;
      });
      this.getLastCoinConfigurationUpdated("", "");
    }
  }

  private async getExchangeRateData() {
    await this.changeTimePeriodEventOnCurrencyExchangeGraph(this.exchangeRateGraphSelectedPeriod);

    if (!this.usdToSelectedCurrencyRate) {
      this.usdToSelectedCurrencyRate = await this.coinValueService.getFIATExchangeRate(this.selectedCurrency ?? "USD", "USD");
    }

    if (!this.cadToSelectedCurrencyRate) {
      this.coinValueService.getFIATExchangeRate(this.selectedCurrency ?? "USD", "CAD").then(res => this.cadToSelectedCurrencyRate = res);
    }
  }
  
  async updateVolumeDisplayData(res: any) {
    if (!res || res.length === 0) return;

    const usdRate = await this.coinValueService.getCurrencyConversionRate("CAD", "USD") ?? 1;
    // Calculate BTC price first
    const btcPrice = (this.btcToCadPrice ?? 1) * usdRate;
    const latestData = res[res.length - 1];
    const newTimestamp = new Date(latestData.timestamp);

    // Only update if we have newer data
    if (this.volumeDisplayData && this.volumeDisplayData.timestamp >= newTimestamp) {
      return;
    }

    // Get latest volumes
    const latestBTC = latestData.volume;
    const latestUSDC = latestData.volumeUSDC;
    const btcInUSDC = latestBTC * btcPrice;

    // Calculate historical ratios (now that btcPrice is available)
    const historicalRatios = res.map((item: any) => {
      const itemBtcValue = item.volumeBTC * btcPrice;
      return itemBtcValue > 0 ? item.volumeUSDC / itemBtcValue : 0;
    });

    // Filter and calculate stats
    const validRatios = historicalRatios.filter((r: any) => r > 0 && isFinite(r));
    const avgRatio = validRatios.length > 0 ? validRatios.reduce((a: any, b: any) => a + b, 0) / validRatios.length : 0;
    const stdDev = validRatios.length > 0 ? Math.sqrt(validRatios.reduce((a: any, r: any) => a + Math.pow(r - avgRatio, 2), 0) / validRatios.length) : 0;

    // Current ratio and log calculations
    const currentRatio = btcInUSDC > 0 ? latestUSDC / btcInUSDC : 0;
    const logBTC = Math.log10(btcInUSDC + 1);
    const logUSDC = Math.log10(latestUSDC + 1);
    const totalLog = logBTC + logUSDC;

    // Determine warning levels for both USDC and BTC dominance independently
    const warnings = {
      usdc: {
        level: 'none' as 'none' | 'mild' | 'severe',
        description: ''
      },
      btc: {
        level: 'none' as 'none' | 'mild' | 'severe',
        description: ''
      }
    };

    if (validRatios.length > 0) {
      // Check for USDC dominance (when ratio is significantly above average)
      if (currentRatio > avgRatio + 2 * stdDev) {
        warnings.usdc.level = 'mild';
      }
      if (currentRatio > avgRatio + 4 * stdDev) {
        warnings.usdc.level = 'severe';
      }

      // Check for BTC dominance (when ratio is significantly below average)
      if (currentRatio < avgRatio - 2 * stdDev) {
        warnings.btc.level = 'mild';
      }
      if (currentRatio < avgRatio - 4 * stdDev) {
        warnings.btc.level = 'severe';
      }
    }

    // Set warning descriptions
    warnings.usdc.description = this.getTypeDominanceDescription(currentRatio, warnings.usdc.level, "USDC");
    warnings.btc.description = this.getTypeDominanceDescription(currentRatio, warnings.btc.level, "BTC");
    const usdcInUSD = latestUSDC;
    const totalUSD = btcInUSDC + usdcInUSD;
    const btcPercentage = totalUSD > 0 ? (btcInUSDC / totalUSD) * 100 : 0;
    const usdcPercentage = totalUSD > 0 ? (usdcInUSD / totalUSD) * 100 : 0;

    this.volumeDisplayData = {
      btc: latestBTC,
      usdc: latestUSDC,
      btcInUSDC: btcInUSDC,
      btcPercentage: btcPercentage,
      usdcPercentage: usdcPercentage,
      btcPrice: btcPrice,
      timestamp: newTimestamp,
      ratio: currentRatio.toFixed(0),
      warnings, // Now contains both USDC and BTC warnings
      dominanceDescription: this.getDominanceDescription(currentRatio)
    };
  }

  private getDominanceDescription(ratio: number): string {
    if (ratio < 10) return "Balanced";
    if (ratio < 100) return "USDC Mild Dominance";
    if (ratio < 1000) return "USDC Strong Dominance";
    return "USDC Extreme Dominance";
  }

  private getTypeDominanceDescription(ratio: number, level: 'none' | 'mild' | 'severe', type: 'BTC' | 'USDC' | 'XRP'): string {
    if (level === 'none') return '';
    const base = level === 'mild' ? `Mild ${type} Dominance` : `Severe ${type} Dominance`;
    return `${base} (Ratio: ${ratio.toExponential(2)})`;
  }
 
  private async startSingleLineLogPolling() {
    const sessionToken = await this.parentRef?.getSessionToken() ?? "";
    this.lastLogEntry = await this.tradeService.getLastTradeLogs(
      this.hasKrakenApi ? this.parentRef?.user?.id ?? 1 : 1,
      sessionToken
    );
    this.singleLineLogInterval = setInterval(async () => {
      const sessionToken = await this.parentRef?.getSessionToken() ?? "";
      this.lastLogEntry = await this.tradeService.getLastTradeLogs(
        this.hasKrakenApi ? this.parentRef?.user?.id ?? 1 : 1,
        sessionToken
      );
    }, 10 * 1000)
  } 
  
  private stopSingleLineLogPolling() {
    clearInterval(this.singleLineLogInterval);
  } 

  private async getUserCurrency() {
    const user = this.parentRef?.user;
    if (user?.id) {
      await this.coinValueService.getUserCurrency(user.id).then(async (res) => {
        if (res) {
          if (res.includes("not found")) {
            this.selectedCurrency = "USD";
            this.selectedFiatConversionName = this.selectedCurrency == 'USD' ? "CAD" : "USD";

          } else {
            this.selectedCurrency = res;
            this.selectedFiatConversionName = res == 'USD' ? "CAD" : "USD";
          }
        }
      });
    } else {
      this.selectedCurrency = "USD";
      this.selectedFiatConversionName = this.selectedCurrency == 'USD' ? "CAD" : "USD";
    }
  }
  private async getCurrencyNames() {
    await this.coinValueService.getUniqueCurrencyNames().then(res => {
      this.fiatNames = res;

      const popularCurrenciesOrder = [
        'USD', 'EUR', 'GBP', 'JPY', 'CAD',
        'AUD', 'CHF', 'CNY', 'NZD', 'SGD'
      ];

      // Reorder currencies - popular first, then others alphabetically
      this.fiatNames.filter(currency => !popularCurrenciesOrder.includes(currency)).sort((a, b) => a.localeCompare(b));
    })
  }

  ngOnDestroy() { 
    this.stopAutoScroll();
    this.stopSingleLineLogPolling();
    this.parentRef?.removeResizeListener();
  }
  private async getIsTradebotStarted() {
    const parent = this.parentRef;
    if (parent && parent.user?.id) {
      const sessionToken = await parent.getSessionToken();
      // Make a single call to get all statuses
      const allStatuses = await this.tradeService.getAllTradebotStatuses(parent.user.id, sessionToken);

      // Update local state with the response
      for (const currency in allStatuses) {
        for (const strategy in allStatuses[currency]) {
          this.tradeBotStartedSince[currency][strategy] = allStatuses[currency][strategy] as Date | undefined;
          this.tradeBotStatus[currency][strategy] = !!allStatuses[currency][strategy];
        }
      }
    } else {
      // Initialize all statuses to false if no user is logged in
      this.tradeBotStatus = {
        BTC: { DCA: false, IND: false, HFT: false },
        XRP: { DCA: false, IND: false, HFT: false },
        SOL: { DCA: false, IND: false, HFT: false },
        XDG: { DCA: false, IND: false, HFT: false },
        ETH: { DCA: false, IND: false, HFT: false }
      };
      this.tradeBotStartedSince = {
        BTC: { DCA: undefined, IND: undefined, HFT: undefined },
        XRP: { DCA: undefined, IND: undefined, HFT: undefined },
        SOL: { DCA: undefined, IND: undefined, HFT: undefined },
        XDG: { DCA: undefined, IND: undefined, HFT: undefined },
        ETH: { DCA: undefined, IND: undefined, HFT: undefined }
      };
    }
  }


  multiplyValues(number1: any, number2: any): number {
    if (number1 && number2) {
      return ((Number)(number1) * (Number)(number2));
    } else {
      return 0;
    }
  }
  roundToEightDecimalPlaces(value: string) {
    var tmpFloat = parseFloat(value);
    return tmpFloat == 0 ? '0' : tmpFloat.toFixed(8).toString();
  }
  closeMiningEvent() {
    this.noMining = true;
  }
  async selectCoin(coinName?: string) {
    if (!coinName) return;
    let tmpCoinName = coinName === "Total BTC" || coinName === "BTC" ? "Bitcoin" : coinName;
    tmpCoinName = tmpCoinName.toLowerCase().includes("total") ? tmpCoinName.replace("Total ", "") : tmpCoinName;
    tmpCoinName = tmpCoinName == "SOL" ? 'Solana' : tmpCoinName;
    tmpCoinName = tmpCoinName == "XDG" ? 'Dogecoin' : tmpCoinName;
    tmpCoinName = tmpCoinName == "ETH" ? 'Ethereum' : tmpCoinName;
    this.currentSelectedCoin = tmpCoinName;

    console.log("currently selected coin : ", this.currentSelectedCoin);

    this.btcConvertCoinSelect.nativeElement.value = this.currentSelectedCoin.replace("BTC", "Bitcoin");
    this.selectedCoinConversionName = this.btcConvertCoinSelect.nativeElement.value;
    this.conversionLock = false; 
    this.handleConversion("BTC", true);

    let changeIndicators = false;
    const defaultCoins = ['Bitcoin', 'Solana', 'XRP', 'Dogecoin', 'Ethereum'];
    if (defaultCoins.includes(this.currentSelectedCoin)) {
      const targetCoin = this.availableIndicatorPairs.filter(x => x.fromCoinLongName == this.currentSelectedCoin)[0].value;
      this.tradeIndicatorSelect.nativeElement.value = targetCoin;
      changeIndicators = true;
    }

    setTimeout(() => {
      if (changeIndicators) {
        this.onIndicatorPairChange();
      }
    }, 50);

    this.coinGraphViewer.lineGraphComponent.scrollToGraph();
  } 

  async handleConversion(source: 'BTC' | 'FIAT' | 'CURRENCY' | 'SAT', runInstantly: boolean = false) {
    if (this.conversionLock) return;

    // Clear any pending debounce
    clearTimeout(this.debounceTimer);

    // Define the conversion logic
    const performConversion = async () => {
      this.conversionLock = true;

      try {
        // Get input values (strip formatting)
        const btcInput = parseFloat(this.convertBTCInput.nativeElement.value) || 1;
        const fiatInput = parseFloat(this.convertFIATInput.nativeElement.value.replace(/[$,]/g, '')) || 0;
        const currencyInput = parseFloat(this.convertCurrencyInput.nativeElement.value.replace(/[$,]/g, '')) || 0;
        let satInput = 1;

        // Handle SAT input synchronously
        if (this.btcConvertCoinSelect.nativeElement.value === 'BTC' && this.convertSATInput?.nativeElement) {
          satInput = parseInt(this.convertSATInput.nativeElement.value.replace(/,/g, ''), 10) || 0;
        }

        // Get current rates
        await this.updateRates();

        // Determine source value
        let sourceValue: number;
        switch (source) {
          case 'BTC': sourceValue = btcInput; break;
          case 'FIAT': sourceValue = fiatInput; break;
          case 'CURRENCY': sourceValue = currencyInput; break;
          case 'SAT': sourceValue = satInput; break;
          default: throw new Error('Invalid source');
        }

        // Calculate all values
        const calculations = this.calculateAllValues(source, sourceValue);

        // Update all inputs
        this.updateAllInputs(calculations);
      } catch (error) {
        console.error('Conversion error:', error);
      } finally {
        // Delay unlocking to ensure UI stability
        setTimeout(() => {
          this.conversionLock = false;
        }, 500);
      }
    };

    // Run instantly or with debounce
    if (runInstantly) {
      await performConversion();
    } else {
      this.debounceTimer = setTimeout(async () => {
        await performConversion();
      }, 300);
    }
  }

  private async updateRates() {
    let selectCoin = this.btcConvertCoinSelect.nativeElement.value.replace("BTC", "Bitcoin");
    const cRes = await this.coinValueService.getLatestCoinValuesByName(selectCoin);
    this.currentRates.coin = cRes as CoinValue;
    // Get fiat rate
    const ceRes = await this.coinValueService.getLatestCurrencyValuesByName(this.selectedFiatConversionName) as ExchangeRate;
    this.currentRates.fiatToCAD = ceRes?.rate || 1;

    // Get currency rate (assuming this is stored elsewhere)
    this.currentRates.currencyToCAD = this.latestCurrencyPriceRespectToCAD ?? 1;
  }

  private calculateAllValues(source: string, sourceValue: number) {
    const { coin, fiatToCAD, currencyToCAD } = this.currentRates;

    let btcValue = 0, fiatValue = 0, currencyValue = 0, satValue = 0;

    switch (source) {
      case 'BTC':
        btcValue = sourceValue;
        satValue = sourceValue * 1e8;
        fiatValue = sourceValue * coin.valueCAD / fiatToCAD;
        currencyValue = sourceValue * coin.valueCAD * currencyToCAD;
        break;

      case 'FIAT':
        btcValue = sourceValue * fiatToCAD / coin.valueCAD;
        satValue = btcValue * 1e8;
        currencyValue = btcValue * coin.valueCAD * currencyToCAD;
        fiatValue = sourceValue; // original input
        break;

      case 'CURRENCY':
        btcValue = sourceValue / (coin.valueCAD * currencyToCAD);
        satValue = btcValue * 1e8;
        fiatValue = btcValue * coin.valueCAD / fiatToCAD;
        currencyValue = sourceValue; // original input
        break;

      case 'SAT':
        btcValue = sourceValue / 1e8;
        satValue = sourceValue; // original input
        fiatValue = btcValue * coin.valueCAD / fiatToCAD;
        currencyValue = btcValue * coin.valueCAD * currencyToCAD;
        break;
    }

    return {
      btc: btcValue,
      fiat: fiatValue,
      currency: currencyValue,
      sat: satValue
    };
  }

  private updateAllInputs(calculations: { btc: number, fiat: number, currency: number, sat: number }) {
    // Update BTC input
    this.convertBTCInput.nativeElement.value = calculations.btc.toFixed(8);

    // Update FIAT input
    this.convertFIATInput.nativeElement.value = this.formatToCanadianCurrency(calculations.fiat);

    // Update Currency input
    this.convertCurrencyInput.nativeElement.value = this.formatToCanadianCurrency(calculations.currency);

    // Update SAT input
    if (this.convertSATInput?.nativeElement) {
      this.convertSATInput.nativeElement.value = this.formatWithCommas(calculations.sat);
    }
  }

  formatStringCanadianCurrency(value: string): string {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
    }).format(parseFloat(value));
  }

  formatToCanadianCurrency(value: number): string {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 8 // Support small values like Pepe Coin
    }).format(value);
  }


  private formatWithCommas(value: number): string {
    return value.toLocaleString('en-US');
  }
  async changeDefaultCurrency() {
    const user = this.parentRef?.user;
    if (!user?.id) return alert("You must be logged in to change your currency");
    const selectedCoin = this.selectedCurrencyDropdown.nativeElement.value;
    this.selectedCurrency = selectedCoin;
    if (selectedCoin && user?.id) {
      await this.coinValueService.updateUserCurrency(user.id, selectedCoin);
    }
    this.ngOnInit();
  }
  getConvertedCurrencyValue(cadValue?: number) {
    if (!cadValue) return 0;
    else return parseFloat((cadValue * (this.latestCurrencyPriceRespectToCAD ?? 1)).toFixed(2));
  }
  getConvertedCurrencyValueRespectToFiat(cadValue?: number) {
    if (!cadValue) return 0;
    else return parseFloat((cadValue * (this.latestCurrencyPriceRespectToFIAT ?? 1)).toFixed(2));
  }
  getConvertedCurrencyValueByString(cadValue?: string) {
    if (!cadValue) return 0;
    else return parseInt(cadValue) * (this.latestCurrencyPriceRespectToCAD ?? 1);
  }
  discreete() {
    this.isDiscreete = !this.isDiscreete;
  }
  showTradeInformationPanel() {
    if (this.isTradeInformationOpen) {
      this.closeTradeInformationPanel();
      return;
    }
    this.isTradeInformationOpen = true;
    this.parentRef?.showOverlay();
  }
  closeTradeInformationPanel() {
    this.isTradeInformationOpen = false;
    setTimeout(() => {
      if (this.parentRef) {
        this.parentRef.closeOverlay();
      }
    }, 50);
  }
  async showTradeSimulationPanel() {
    if (this.isShowingTradeSimulator) {
      this.closeTradeSimulationPanel();
      return;
    }
    //load the config
    const userId = this.parentRef?.user?.id ?? 1;
    const sessionToken = await this.parentRef?.getSessionToken();

    const tv = await this.tradeService.getTradeConfiguration(userId, sessionToken ?? "", undefined, undefined, "DCA");
    if (tv) {
      this.tradeSimParams.tradeThreshold = tv.tradeThreshold;
      this.tradeSimParams.tradePercentage = tv.maximumToTradeAmount;
    }
    //load the panel
    this.closeTradeDivs();
    this.startLoading();
    this.generateSimulationData();

    setTimeout(() => {
      this.isShowingTradeSimulator = true;
      this.stopLoading();
    }, 50);
  }
  async randomizeTradingSimGraphWithRandomDayThisWeek() {
    const hours = 24 * 7;
    await this.coinValueService.getAllCoinValuesForGraph(new Date(), hours, "Bitcoin").then(res => {
      if (res) {
        this.allHistoricalTradeSimData = res.filter((x: any) => x.name == 'Bitcoin');
        this.allHistoricalTradeSimData?.forEach(x => x.valueCAD = x.valueCAD * this.latestCurrencyPriceRespectToCAD);
      }
    });

    this.getRandomDayData();
    this.tradebotSimulationGraphData2 = this.generateTradeData(
      this.tradebotSimulationGraphData,
      this.tradeSimParams
    );
  }
  async randomizeTradingSimGraphWithRandomWeekData() {
    const hours = 24 * 7 * 365;
    await this.coinValueService.getAllCoinValuesForGraph(new Date(), hours, "Bitcoin").then(res => {
      if (res) {
        this.allHistoricalTradeSimData = res.filter((x: any) => x.name == 'Bitcoin');
        this.allHistoricalTradeSimData?.forEach(x => x.valueCAD = x.valueCAD * this.latestCurrencyPriceRespectToCAD);
      }
    });

    this.getRandomWeekOrMonthData("week");
    this.tradebotSimulationGraphData2 = this.generateTradeData(
      this.tradebotSimulationGraphData,
      this.tradeSimParams
    );
  }
  async randomizeTradingSimGraphWithRandomMonthData() {
    const hours = 24 * 7 * 365;
    await this.coinValueService.getAllCoinValuesForGraph(new Date(), hours, "Bitcoin").then(res => {
      if (res) {
        this.allHistoricalTradeSimData = res.filter((x: any) => x.name == 'Bitcoin');
        this.allHistoricalTradeSimData?.forEach(x => x.valueCAD = x.valueCAD * this.latestCurrencyPriceRespectToCAD);
      }
    });

    this.getRandomWeekOrMonthData("month");
    this.tradebotSimulationGraphData2 = this.generateTradeData(
      this.tradebotSimulationGraphData,
      this.tradeSimParams
    );
  }
  randomizeTradingSimGraph() {
    this.tradeBotSimDebug = [];
    this.generateSimulationData();
  }

  closeTradeSimulationPanel() {
    this.isShowingTradeSimulator = false;
  }
  getRandomDayData() {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to start of day

    // If today is Monday (1) or Sunday (0), use last week's data
    const dayOfWeek = today.getDay(); // 0 (Sun) to 6 (Sat)
    const useLastWeek = dayOfWeek === 0 || dayOfWeek === 1;

    // Find the most recent Monday (start of the current or previous week)
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Adjust for Monday start
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - daysSinceMonday - (useLastWeek ? 7 : 0)); // Go back 7 more days if needed
    weekStart.setHours(0, 0, 0, 0);

    // Step 2: Get a random day from the week (Monday to Sunday)
    const randomDayOffset = Math.floor(Math.random() * 7); // 0 (Mon) to 6 (Sun)
    const randomDay = new Date(weekStart);
    randomDay.setDate(weekStart.getDate() + randomDayOffset);

    // Ensure the random day is before today
    if (randomDay >= today) {
      randomDay.setDate(randomDay.getDate() - 7); // Fall back to the previous week
    }

    // Step 3: Format the random day as "YYYY-MM-DD"
    const year = randomDay.getFullYear();
    const month = String(randomDay.getMonth() + 1).padStart(2, '0');
    const day = String(randomDay.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;

    // Step 4: Filter data for the random day
    this.tradebotSimulationGraphData = this.allHistoricalTradeSimData?.filter(x => {
      if (!x.timestamp) return false;
      return x.name === 'Bitcoin' && x.timestamp.startsWith(dateString);
    }) ?? [];
    this.tradebotSimulationGraphData.forEach(x => {
      const cadToUsdRate = this.findClosestHistoricalExchangeRate(x.timestamp, "usd") ?? 1;
      x.valueCAD = (x.value ?? x.valueCAD) * cadToUsdRate;
    });
  }
  getRandomWeekOrMonthData(weekOrMonth: 'week' | 'month'): void {
    // Step 1: Validate allHistoricalData
    if (!this.allHistoricalTradeSimData || this.allHistoricalTradeSimData.length === 0) {
      console.log('No historical data available.');
      this.tradebotSimulationGraphData = [];
      return;
    }
    const timestamps: Date[] = this.allHistoricalTradeSimData
      .filter((x: any): boolean => x.name === 'Bitcoin' && x.timestamp)
      .map((x: any): Date | null => {
        const date = new Date(x.timestamp);
        if (isNaN(date.getTime())) {
          console.warn(`Invalid timestamp: ${x.timestamp}`);
          return null;
        }
        return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      })
      .filter((date: Date | null): boolean => date !== null) as Date[];

    if (timestamps.length === 0) {
      console.log('No valid Bitcoin data available.');
      this.tradebotSimulationGraphData = [];
      return;
    }
    const minDate: Date = new Date(Math.min(...timestamps.map((date: Date): number => date.getTime())));
    const maxDate: Date = new Date(Math.max(...timestamps.map((date: Date): number => date.getTime())));
    const today: Date = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (maxDate > today) {
      maxDate.setTime(today.getTime());
    }
    const formatDate = (date: Date): string => {
      const year: number = date.getUTCFullYear();
      const month: string = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day: string = String(date.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    if (weekOrMonth === 'week') {
      const earliestMonday: Date = new Date(minDate);
      const minDayOfWeek: number = earliestMonday.getDay();
      const daysToFirstMonday: number = minDayOfWeek === 0 ? 1 : minDayOfWeek === 1 ? 0 : 8 - minDayOfWeek;
      earliestMonday.setDate(earliestMonday.getDate() + daysToFirstMonday);
      earliestMonday.setUTCHours(0, 0, 0, 0);

      const latestMonday: Date = new Date(maxDate);
      latestMonday.setDate(maxDate.getDate() - 6); // Ensure 7 days from Monday fit
      const latestMondayDayOfWeek: number = latestMonday.getDay();
      const daysToLatestMonday: number = latestMondayDayOfWeek === 0 ? 6 : latestMondayDayOfWeek - 1;
      latestMonday.setDate(latestMonday.getDate() - daysToLatestMonday);
      latestMonday.setUTCHours(0, 0, 0, 0);

      const millisecondsPerWeek: number = 7 * 24 * 60 * 60 * 1000;
      const weeksAvailable: number = Math.floor((latestMonday.getTime() - earliestMonday.getTime()) / millisecondsPerWeek) + 1;
      if (weeksAvailable <= 0) {
        console.log('Not enough data for a full week.');
        this.tradebotSimulationGraphData = [];
        return;
      }

      const randomWeekIndex: number = Math.floor(Math.random() * weeksAvailable);
      const randomMonday: Date = new Date(earliestMonday);
      randomMonday.setDate(earliestMonday.getDate() + randomWeekIndex * 7);

      const weekEnd: Date = new Date(randomMonday);
      weekEnd.setDate(randomMonday.getDate() + 6);

      const weekDates: string[] = [];
      for (let i = 0; i < 7; i++) {
        const currentDay: Date = new Date(randomMonday);
        currentDay.setDate(randomMonday.getDate() + i);
        weekDates.push(formatDate(currentDay));
      }

      this.tradebotSimulationGraphData = this.allHistoricalTradeSimData.filter((x: any): boolean => {
        if (!x.timestamp || x.name !== 'Bitcoin') return false;
        const date = new Date(x.timestamp);
        if (isNaN(date.getTime())) return false;
        const datePart: string = formatDate(date);
        return weekDates.includes(datePart);
      });

    } else {
      const earliestMonth: Date = new Date(Date.UTC(minDate.getUTCFullYear(), minDate.getUTCMonth(), 1));
      const latestMonth: Date = new Date(Date.UTC(maxDate.getUTCFullYear(), maxDate.getUTCMonth(), 1));

      const monthsAvailable = (latestMonth.getUTCFullYear() - earliestMonth.getUTCFullYear()) * 12 +
        (latestMonth.getUTCMonth() - earliestMonth.getUTCMonth()) + 1;

      if (monthsAvailable <= 0) {
        console.log('Not enough data for a full month.');
        this.tradebotSimulationGraphData = [];
        return;
      }

      // Step 6: Select a random month
      const randomMonthIndex: number = Math.floor(Math.random() * monthsAvailable);
      const randomMonthStart: Date = new Date(earliestMonth);
      randomMonthStart.setUTCMonth(earliestMonth.getUTCMonth() + randomMonthIndex);

      // Step 7: Calculate month end date
      const randomMonthEnd: Date = new Date(randomMonthStart);
      randomMonthEnd.setUTCMonth(randomMonthStart.getUTCMonth() + 1);
      randomMonthEnd.setUTCDate(0); // Last day of the month

      // Generate all dates in the month
      const monthDates: string[] = [];
      const currentDay = new Date(randomMonthStart);
      while (currentDay <= randomMonthEnd) {
        monthDates.push(formatDate(currentDay));
        currentDay.setUTCDate(currentDay.getUTCDate() + 1);
      }

      // Step 8: Filter data for the selected month
      this.tradebotSimulationGraphData = this.allHistoricalTradeSimData.filter((x: any): boolean => {
        if (!x.timestamp || x.name !== 'Bitcoin') return false;
        const date = new Date(x.timestamp);
        if (isNaN(date.getTime())) return false;
        const datePart: string = formatDate(date);
        return monthDates.includes(datePart);
      });

      // console.log(`Random month: ${formatDate(randomMonthStart)} to ${formatDate(randomMonthEnd)}, Data points: ${this.tradebotSimulationGraphData.length}`);
    }
    this.tradebotSimulationGraphData.forEach(x => {
      const cadToUsdRate = this.findClosestHistoricalExchangeRate(x.timestamp, "usd") ?? 1;
      x.valueCAD = (x.value ?? x.valueCAD) * cadToUsdRate;
    });
  }
  updateSimTradeVars() {
    if (this.initialBtcUsd?.nativeElement.value) {
      this.tradeSimParams.initialBtc = parseFloat(this.initialBtcUsd.nativeElement.value);
    }
    if (this.initialUsdc?.nativeElement.value) {
      this.tradeSimParams.initialUsd = parseFloat(this.initialUsdc.nativeElement.value);
    }
    if (this.tradeSpreadPct?.nativeElement.value) {
      this.tradeSimParams.tradeThreshold = parseFloat(this.tradeSpreadPct.nativeElement.value);
    }
    if (this.tradeFeePct?.nativeElement.value) {
      this.tradeSimParams.fee = parseFloat(this.tradeFeePct.nativeElement.value);
    }
    if (this.tradeAmountPct?.nativeElement.value) {
      this.tradeSimParams.tradePercentage = parseFloat(this.tradeAmountPct.nativeElement.value);
    }
  }
  generateSimulationData(timeRange: string = '1d') {
    // 1. Generate price data first
    this.tradebotSimulationGraphData = this.generatePriceData(timeRange);

    // 2. Then generate trade data based on prices
    this.tradebotSimulationGraphData2 = this.generateTradeData(
      this.tradebotSimulationGraphData,
      this.tradeSimParams
    );
  }

  // Generate realistic BTC price data for given time range
  generatePriceData(timeRange: string): any[] {
    const now = new Date();
    let hours = 24; // Default to 1 day
    let volatility = 155.002; // Base volatility (0.2%)

    // Adjust parameters based on time range
    switch (timeRange) {
      case '1h':
        hours = 1;
        volatility = 0.001;
        break;
      case '4h':
        hours = 4;
        volatility = 0.0015;
        break;
      case '1d':
        hours = 24;
        volatility = 0.002;
        break;
      case '7d':
        hours = 168;
        volatility = 0.003;
        break;
      case '14d':
        hours = 336;
        volatility = 0.004;
        break;
    }

    const data = [];
    const startPrice = this.btcToCadPrice || 50000; // Current price or default
    let currentPrice = startPrice;

    // Generate data points (1 per minute)
    for (let i = 0; i < hours * 60; i++) {
      const time = new Date(now.getTime() - (hours * 60 * 60 * 1000) + (i * 60 * 1000));

      // Random walk with momentum
      const randomChange = (Math.random() * 2 - 1) * volatility;
      currentPrice = currentPrice * (1 + randomChange);

      // Occasionally add larger moves (5% chance)
      if (Math.random() < 0.05) {
        const spike = (Math.random() * 0.04 - 0.02); // -2% to +2%
        currentPrice = currentPrice * (1 + spike);
      }

      // Gentle mean reversion
      if (currentPrice > startPrice * 1.2) {
        currentPrice *= 0.999;
      } else if (currentPrice < startPrice * 0.8) {
        currentPrice *= 1.001;
      }

      data.push({
        name: 'Bitcoin',
        timestamp: time.toISOString(),
        value: currentPrice
      });
    }

    return data;
  }
  generateTradeData(priceData: any[], parameters: any): any[] {
    // Validate all parameters before starting
    if (!priceData || priceData.length == 0) {
      console.error("invalid price data")
      return [];
    }
    if (typeof parameters.initialBtc !== 'number' || parameters.initialBtc <= 0) {
      console.error("Invalid initialBtc parameter");
      return [];
    }
    if (typeof parameters.initialUsd !== 'number' || parameters.initialUsd <= 0) {
      console.error("Invalid initialUsd parameter");
      return [];
    }
    if (typeof parameters.tradeThreshold !== 'number' || parameters.tradeThreshold <= 0) {
      console.error("Invalid tradeThreshold parameter");
      return [];
    }
    if (typeof parameters.tradePercentage !== 'number' || parameters.tradePercentage <= 0 || parameters.tradePercentage > 1) {
      console.error("Invalid tradePercentage parameter");
      return [];
    }
    if (typeof parameters.maxBtcTrade !== 'number' || parameters.maxBtcTrade <= 0) {
      console.error("Invalid maxBtcTrade parameter");
      return [];
    }
    if (typeof parameters.minBtcTrade !== 'number' || parameters.minBtcTrade <= 0) {
      console.error("Invalid minBtcTrade parameter");
      return [];
    }
    if (typeof parameters.cooldownMinutes !== 'number' || parameters.cooldownMinutes <= 0) {
      console.error("Invalid cooldownMinutes parameter");
      return [];
    }
    if (typeof parameters.fee !== 'number' || parameters.fee < 0 || parameters.fee >= 1) {
      console.error("Invalid fee parameter");
      return [];
    }

    const tradeData = [];
    let bitcoinBalance = parameters.initialBtc;
    let usdBalance = parameters.initialUsd;
    let lastTradeTime: any = null;
    let lastTradePrice = priceData[0].value ?? priceData[0].valueCAD;
    let recentTradeTypes: any[] = [];

    // Track daily prices
    let currentDay = '';
    let todayStartingPrice = lastTradePrice;

    let totalBTCSaleValue = 0;
    let totalUSDCBuyValue = 0;
    let totalFees = 0;

    // Benchmark values
    const initialPrice = priceData[0].value ?? priceData[0].valueCAD;
    const initialBitcoinHold = parameters.initialBtc;
    const initialUsdHold = parameters.initialUsd;
    const initialAllUsd = parameters.initialUsd + (parameters.initialBtc * initialPrice);

    // Trade diagnostics
    let checks = 0;
    let spreadTooSmall = 0;
    let cooldownActive = 0;
    let insufficientFunds = 0;
    let consecutiveBlock = 0;
    let potentialTrades = 0;

    this.tradeBotSimDebug = [];
    this.tradeBotSimDebug.push('=== TRADE SIMULATION ===');
    this.tradeBotSimDebug.push(`Parameters: ${JSON.stringify(parameters, null, 2)}`);
    this.tradeBotSimDebug.push(`Starting balances: ${bitcoinBalance} BTC, $${usdBalance} USD`);
    this.tradeBotSimDebug.push(`Initial price: $${initialPrice}`);

    priceData.forEach(dataPoint => {
      checks++;
      const currentTime = new Date(dataPoint.timestamp);
      const currentPrice = (dataPoint.value ?? dataPoint.valueCAD);
      const portfolioValue = usdBalance + (bitcoinBalance * currentPrice);

      // Check if we've moved to a new day
      const dataPointDay = currentTime.toISOString().split('T')[0];
      if (dataPointDay !== currentDay) {
        currentDay = dataPointDay;
        todayStartingPrice = currentPrice; // Update today's starting price
      }

      const noTradeIn24Hrs = !lastTradeTime || (currentTime.getTime() - lastTradeTime.getTime()) > 24 * 60 * 60 * 1000;
      // Check cooldown period
      const canTrade = !lastTradeTime ||
        (currentTime.getTime() - lastTradeTime.getTime()) > parameters.cooldownMinutes * 60 * 1000;

      if (!canTrade) {
        cooldownActive++;
        return;
      }

      // Determine the reference price - use last trade price if available, otherwise use today's starting price
      const priceChange = (currentPrice - lastTradePrice) / lastTradePrice;
      const priceChange2 = (currentPrice - todayStartingPrice) / todayStartingPrice;

      if (Math.abs(priceChange) >= parameters.tradeThreshold || (noTradeIn24Hrs && Math.abs(priceChange2) >= parameters.tradeThreshold)) {
        potentialTrades++;

        if ((priceChange > 0 || (noTradeIn24Hrs && priceChange2 > 0)) && bitcoinBalance > parameters.minBtcTrade) {
          // Sell conditions
          if (recentTradeTypes.length >= 4 && recentTradeTypes.slice(-4).every(t => t === 'sell')) {
            consecutiveBlock++;
            return;
          }

          const bitcoinToSell = Math.min(
            bitcoinBalance * parameters.tradePercentage,
            parameters.maxBtcTrade
          );

          if (bitcoinToSell >= parameters.minBtcTrade) {
            const usdReceived = bitcoinToSell * currentPrice * (1 - parameters.fee);
            const fee = bitcoinToSell * currentPrice * parameters.fee;

            // Execute sell
            bitcoinBalance -= bitcoinToSell;
            usdBalance += usdReceived;
            lastTradeTime = currentTime;
            lastTradePrice = currentPrice;
            recentTradeTypes.push('sell');
            totalFees += fee;
            totalBTCSaleValue += bitcoinToSell * currentPrice;

            this.tradeBotSimDebug.push(`[SELL] ${currentTime}`);
            this.tradeBotSimDebug.push(`Price: $${currentPrice.toFixed(2)} (${(priceChange * 100).toFixed(2)}% ${noTradeIn24Hrs ? '/' + (priceChange2 * 100).toFixed(2) : ''}% change)`);
            this.tradeBotSimDebug.push(`Sold ${bitcoinToSell.toFixed(8)} BTC for $${usdReceived.toFixed(2)} (Fee: $${fee.toFixed(2)})`);
            this.tradeBotSimDebug.push(`New balances: ${bitcoinBalance.toFixed(8)} BTC, $${usdBalance.toFixed(2)} USD`);
            this.tradeBotSimDebug.push(`Portfolio Value: ${portfolioValue.toFixed(8)} USD`);

            tradeData.push({
              timestamp: dataPoint.timestamp,
              type: 'sell',
              value: lastTradePrice,
            });
          } else {
            insufficientFunds++;
          }
        }
        else if ((priceChange < 0 || (noTradeIn24Hrs && priceChange2 < 0)) && usdBalance > 10) {
          // Buy conditions
          if (recentTradeTypes.length >= 4 && recentTradeTypes.slice(-4).every(t => t === 'buy')) {
            consecutiveBlock++;
            return;
          }

          const usdToSpend = Math.min(
            usdBalance * parameters.tradePercentage,
            parameters.maxBtcTrade * currentPrice
          );

          if (usdToSpend >= 10) {
            const bitcoinBought = (usdToSpend / currentPrice) * (1 - parameters.fee);
            const fee = usdToSpend * parameters.fee;

            // Execute buy
            usdBalance -= usdToSpend;
            bitcoinBalance += bitcoinBought;
            lastTradeTime = currentTime;
            lastTradePrice = currentPrice;
            recentTradeTypes.push('buy');
            totalFees += fee;
            totalUSDCBuyValue += usdToSpend;

            this.tradeBotSimDebug.push(`[BUY] ${currentTime}`);
            this.tradeBotSimDebug.push(`Price: $${currentPrice.toFixed(2)} (${(priceChange * 100).toFixed(2)}% ${noTradeIn24Hrs ? '/' + (priceChange2 * 100).toFixed(2) : ''}% change)`);
            this.tradeBotSimDebug.push(`Bought ${bitcoinBought.toFixed(8)} BTC for $${usdToSpend.toFixed(2)} (Fee: $${fee.toFixed(2)})`);
            this.tradeBotSimDebug.push(`New balances: ${bitcoinBalance.toFixed(8)} BTC, $${usdBalance.toFixed(2)} USD`);
            this.tradeBotSimDebug.push(`Portfolio Value: ${portfolioValue.toFixed(8)} USD`);

            tradeData.push({
              timestamp: dataPoint.timestamp,
              type: 'buy',
              value: lastTradePrice,
            });
          } else {
            insufficientFunds++;
          }
        }
      } else {
        spreadTooSmall++;
      }
    });

    // Final calculations
    const finalPrice = (priceData[priceData.length - 1].value ?? priceData[priceData.length - 1].valueCAD);
    const finalStrategyValue = usdBalance + (bitcoinBalance * finalPrice * (tradeData.length > 0 ? (1 - parameters.fee) : 1));
    const finalHoldValue = initialUsdHold + (initialBitcoinHold * finalPrice);
    const finalAllUsd = initialAllUsd;
    const vsHold = finalStrategyValue - finalHoldValue;
    const vsUsd = finalStrategyValue - finalAllUsd;
    const performance = totalBTCSaleValue - totalUSDCBuyValue - totalFees;

    // Diagnostic summary
    this.tradeBotSimDebug.push('\n=== SIMULATION RESULTS ===');
    this.tradeBotSimDebug.push(`Price checks: ${checks}`);
    this.tradeBotSimDebug.push(`Potential trades: ${potentialTrades}`);
    this.tradeBotSimDebug.push(`Missed trades - Spread too small: ${spreadTooSmall}`);
    this.tradeBotSimDebug.push(`Missed trades - Cooldown: ${cooldownActive}`);
    this.tradeBotSimDebug.push(`Missed trades - Insufficient funds: ${insufficientFunds}`);
    this.tradeBotSimDebug.push(`Missed trades - Consecutive block: ${consecutiveBlock}`);
    this.tradeBotSimDebug.push(`Executed trades: ${tradeData.length}`);
    this.tradeBotSimDebug.push('\n=== FINAL VALUES ===');
    this.tradeBotSimDebug.push(`Strategy: $${finalStrategyValue.toFixed(2)}; Trade Performance (Gains or losses): $${performance}`);
    this.tradeBotSimDebug.push(`Buy & Hold: $${finalHoldValue.toFixed(2)} (${vsHold >= 0 ? '+' : ''}${vsHold.toFixed(2)})`);
    this.tradeBotSimDebug.push(`All USD: $${finalAllUsd.toFixed(2)} (${vsUsd >= 0 ? '+' : ''}${vsUsd.toFixed(2)})`);

    // Add final summary
    tradeData.push({
      summary: true,
      timestamp: priceData[priceData.length - 1].timestamp,
      finalStrategyValue: finalStrategyValue,
      finalHoldValue: finalHoldValue,
      finalAllUsd: finalAllUsd,
      vsHold: vsHold,
      vsUsd: vsUsd,
      totalTrades: tradeData.length,
      diagnostics: {
        checks,
        potentialTrades,
        spreadTooSmall,
        cooldownActive,
        insufficientFunds,
        consecutiveBlock
      }
    });

    return tradeData;
  }
  downloadSimTradeDataCSV() {
    const priceData = this.generatePriceData("1");
    const tradeData = this.generateTradeData(priceData, this.tradeSimParams);
    const csv = tradeData.map(row => `${row.timestamp},${row.action},${row.value.toFixed(2)},${row.btcAmount.toFixed(6)},${row.usdcAmount.toFixed(2)},${row.tradeAmount.toFixed(6)},${row.tradeGrossValue.toFixed(2)},${row.tradeFee.toFixed(2)},${row.tradeNetValue.toFixed(2)},${row.lastTradePrice.toFixed(2)}`).join('\n');
    const blob = new Blob([`Timestamp,Action,Net Profit,BTC Amount,USDC Amount,Trade Amount,Trade Gross Value,Trade Fee,Trade Net Value,Last Trade Price\n${csv}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trade_data.csv';
    a.click();
  }
  showMenuPanel() {
    if (this.isMenuPanelOpen) {
      this.closeMenuPanel();
      return;
    }
    this.isMenuPanelOpen = true;
    if (this.parentRef) {
      this.parentRef.showOverlay();
    }
  }
  closeMenuPanel() {
    if (this.fullscreenTimeout) return;
    this.isMenuPanelOpen = false;
    this.fullscreenTimeout = true;
    setTimeout(() => {
      if (this.parentRef) {
        this.parentRef.closeOverlay();
      }
    }, 5);

    setTimeout(() => this.fullscreenTimeout = false, 500);
  }
  generateGeneralAiMessage() {
    this.startLoading();
    alert("Feature under construction.");
    this.stopLoading();
    // this.finishedGeneratingAiMessage = false;
    // clearTimeout(this.debounceTimer);
    // this.debounceTimer = setTimeout(() => {
    //   const coinValueBTCData = this.allHistoricalTradeSimData?.filter(x => x.name === "Bitcoin");
    //   this.generateAiMessage("1", coinValueBTCData).then(res => {
    //     this.finishedGeneratingAiMessage = true;
    //     this.hideHostAiMessage = false;
    //     this.stopLoading();
    //   });
    // }, 500);
  }
  async generateWalletAiMessage() {
    this.startLoading();
    this.finishedGeneratingAiWalletMessage = false;
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.finishedGeneratingAiWalletMessage = false;
      this.generateAiMessage(this.currentlySelectedCurrency?.address ?? "", this.allWalletBalanceData).then(res => {
        this.finishedGeneratingAiWalletMessage = true;
        this.hideHostAiMessageWallet = false;
        this.stopLoading();
      });
    }, 500);
  }

  private async generateAiMessage(walletAddress: string, data: any) {
    const tgtMessage = this.aiMessages.find(x => x.addr === walletAddress);
    let response = undefined;
    if (!tgtMessage && walletAddress != "Nicehash Wallet") {
      let latest = data?.slice(-250) || [];
      let message = "";
      const today = new Date();
      const fiveDaysAgo = new Date(today);
      fiveDaysAgo.setDate(today.getDate() - 5);
      const todayStr = today.toLocaleDateString('en-US');
      const fiveDaysAgoStr = fiveDaysAgo.toLocaleDateString('en-US');
      if (walletAddress === "1") {
        message = `Analyze the following Bitcoin wallet balance data: ${JSON.stringify(latest)}. 
            Focus on trends, volatility, and price action over the last 5 days (${fiveDaysAgoStr} to ${todayStr}).  
            Identify:
            - Recent trends (uptrend, downtrend, or consolidation).
            - Volatility and major price swings.
            - Potential buy or sell signals based on expert trading strategies. 
            Provide a recommendation: Should I buy, sell, or hold today? Justify your answer with relevant analysis.
            Avoid any disclaimers or unnecessary commentary. Avoid reiterating the prompt.`;
      } else {
        message = `Analyze the following Bitcoin wallet balance data: ${JSON.stringify(latest)}. 
        Focus on trends, volatility, and price action over the last 5 days (${fiveDaysAgoStr} to ${todayStr}).  
            Identify:
            - Recent trends (uptrend, downtrend, or consolidation).
            - Volatility and major price swings.
            - Potential buy or sell signals based on expert trading strategies.  
            Provide a recommendation on whether to buy, sell, or hold today, with clear justification based on the trends and price action in the last 5 days.
            Avoid any disclaimers or unnecessary commentary. Avoid reiterating the prompt.`;
      }
      const sessionToken = await this.parentRef?.getSessionToken();
      await this.aiService.sendMessage(this.parentRef?.user?.id ?? 0, true, message, sessionToken ?? "", 600).then(res => {
        if (res && res.response) {
          response = this.aiService.parseMessage(res.response) ?? "Error.";
          this.aiMessages.push({ addr: walletAddress ?? "1", message: response });
        }
      });
    }
    return response;
  }

  findClosestHistoricalExchangeRate(
    timestamp: string,
    targetCurrency?: string,
    baseCurrency: string = "CAD"
  ): number | null {
    //console.log("finding historical exchange rate for ",targetCurrency,baseCurrency);
    if (!this.allHistoricalExchangeRateData || this.allHistoricalExchangeRateData.length === 0) {
      return null;
    }

    const targetCurrencyToUse = (targetCurrency ?? this.selectedCurrency ?? "CAD").toLowerCase().trim();
    const baseCurrencyToUse = baseCurrency.toLowerCase().trim();
    const cacheKey = `${baseCurrencyToUse}_${targetCurrencyToUse}`;

    // Check cache first
    if (!this.exchangeRateCache.has(cacheKey)) {
      // Pre-process data for this currency pair
      const oneDayMs = 24 * 60 * 60 * 1000;
      const now = new Date();
      const oneDayBefore = new Date(now.getTime() - oneDayMs);
      const oneDayAfter = new Date(now.getTime() + oneDayMs);

      // Filter and sort data just once per currency pair
      const dataInRange = this.allHistoricalExchangeRateData.filter(x => {
        const date = new Date(x.timestamp);
        return date >= oneDayBefore && date <= oneDayAfter;
      });

      const targetRates = dataInRange
        .filter(x => x.targetCurrency.toLowerCase() === targetCurrencyToUse)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      let baseRates: ExchangeRate[] = [];
      if (baseCurrencyToUse !== "cad") {
        baseRates = dataInRange
          .filter(x => x.targetCurrency.toLowerCase() === baseCurrencyToUse)
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      }

      // Pre-compute timestamps for faster searching
      this.exchangeRateCache.set(cacheKey, {
        baseRates,
        targetRates,
        baseTimestamps: baseRates.map(x => new Date(x.timestamp).getTime()),
        targetTimestamps: targetRates.map(x => new Date(x.timestamp).getTime())
      });
      //console.log("cache key generated: ", this.exchangeRateCache.get(cacheKey));
    }

    const cached = this.exchangeRateCache.get(cacheKey)!;
    const targetTimestamp = new Date(timestamp).getTime();

    // Fast binary search helper
    const findClosestIndex = (timestamps: number[]) => {
      let left = 0, right = timestamps.length - 1;
      while (left < right) {
        const mid = Math.floor((left + right) / 2);
        if (timestamps[mid] === targetTimestamp) return mid;
        else if (timestamps[mid] < targetTimestamp) left = mid + 1;
        else right = mid;
      }
      return left;
    };

    // Handle case where no target rates exist
    if (cached.targetRates.length === 0 || (baseCurrencyToUse !== "cad" && cached.baseRates.length === 0)) {
      return null;
    }

    // Find closest target rate
    const targetIdx = findClosestIndex(cached.targetTimestamps);
    const closestTargetRate = cached.targetRates[targetIdx].rate;

    // If base is CAD, return directly
    if (baseCurrencyToUse === "cad") {
      return closestTargetRate;
    }

    // Find closest base rate
    const baseIdx = findClosestIndex(cached.baseTimestamps);
    const closestBaseRate = cached.baseRates[baseIdx].rate;

    // Compute cross-rate
    return closestTargetRate / closestBaseRate;
  }
   
  getAiMessage(walletAddr?: string) {
    if (!walletAddr) return "";
    return this.aiMessages.find(x => x.addr === walletAddr)?.message;
  }
  hideBalance() {
    this.isTradebotBalanceShowing = false;
  }
  showTradeLiveView() {
    console.log("showTradeLiveView", this.isTradeLiveViewShowing);
    this.closeTradeDivs();
    this.isTradeLiveViewShowing = true;
  }
  hideTradeLiveView() {
    this.isTradeLiveViewShowing = false;
  }
  async checkBalance() { 
    if (!this.isTradePanelOpen) return;
    this.isTradebotBalanceShowing = true;
  }
  closeTradeDivs() {
    this.showingTradeLogs = false;
    this.showingTradeSettings = false;
    this.isShowingTradeValueGraph = false;
    this.isTradebotBalanceShowing = false;
    this.isShowingTradeSimulator = false;
    this.isShowingTradeProfit = false;
    this.isTradeLiveViewShowing = false;
  }

  async openTradeFullscreen() {
    this.tradeConfigLastUpdated = undefined;
    if (this.isTradePanelOpen) {
      this.closeTradeFullscreen(); 
      this.startSingleLineLogPolling(); 
      this.startAutoScroll();
    } else {
      this.isTradePanelOpen = true;
      this.stopAutoScroll();
      this.stopSingleLineLogPolling(); 
      if (!this.numberOfTrades) {
        this.getNumberOfTrades();
      }
    }
  }
  closeTradeFullscreen() {
    this.closeTradeDivs();
    this.isTradePanelOpen = false;
  }
  async showTradeSettings() {
    if (!this.parentRef?.user?.id) { return alert("You must be logged in to save settings."); }
    const tmpStatus = this.showingTradeSettings;
    let selectedCurrency = this.selectedTradebotCurrency?.nativeElement?.value ?? "XBT";
    let selectedStrategy = this.selectedTradebotStrategy?.nativeElement?.value ?? "DCA";
    selectedCurrency = selectedCurrency.replace("BTC", "XBT");
    this.closeTradeDivs();
    this.showingTradeSettings = !tmpStatus;

    if (this.showingTradeSettings) {
      await this.getLastCoinConfigurationUpdated(selectedCurrency, "USDC", selectedStrategy);
      setTimeout(async () => {
        this.startLoading();
        if (this.configurationComponent?.tradeFromCoinSelect?.nativeElement) {
          this.configurationComponent.tradeFromCoinSelect.nativeElement.value = selectedCurrency;
          this.configurationComponent.tradeStrategySelect.nativeElement.value = selectedStrategy;
        }
        await this.configurationComponent?.getTradeConfiguration();
        this.stopLoading();
      }, 500);
    }
  }
  updatedTradeConfigEvent(event: string) {
    this.tradeConfigLastUpdated = new Date();
  }
  get totalMarketCap(): number {
    return this.cryptoMarketCapsComponent?.totalMarketCap ?? 0;
  }

  showTradeGraphWrapper() {
    this.closeTradeDivs();
  }
  async showTradeValueGraph() {
    const tmpStatus = this.isShowingTradeValueGraph;
    this.closeTradeDivs();
    this.startLoading();
    this.isShowingTradeValueGraph = !tmpStatus;
    
    this.stopLoading();
  }
 
  getFullCoinName(symbol: string): string {
    const map: { [key: string]: string } = {
      BTC: 'Bitcoin',
      XBT: 'Bitcoin',
      ETH: 'Ethereum',
      LTC: 'Litecoin',
      USDC: 'USDCoin',
    };
    return map[symbol.toUpperCase()] || symbol;
  }

  async showTradeLogs() { 
    if (!this.isTradePanelOpen) {
      this.openTradeFullscreen();
      setTimeout(() => {
        this.showTradeLogs();
      });
      return;
    }
    const wasShowingLogs = this.showingTradeLogs;
    this.closeTradeDivs();
    setTimeout(async () => {
      this.showingTradeLogs = !wasShowingLogs; 
    }, 50); 
  }
  
  
  onMouseDown(event: MouseEvent) {
    this.isDragging = true;
    this.scrollContainer.nativeElement.classList.add('dragging');
    this.marqueeStartX = event.pageX - this.scrollContainer.nativeElement.offsetLeft;
    this.marqueeScrollLeft = this.scrollContainer.nativeElement.scrollLeft;
    this.stopAutoScroll();                        // ← changed
  }

  onMouseMove(event: MouseEvent) {
    if (!this.isDragging) {
      this.marqueeScrollSpeed = 0.35;
      return;
    }
    event.preventDefault();
    const x = event.pageX - this.scrollContainer.nativeElement.offsetLeft;
    const walk = (x - this.marqueeStartX) * 1; // speed factor
    this.scrollContainer.nativeElement.scrollLeft = this.marqueeScrollLeft - walk;
  }

  onMarqueeMouseUp() {
    if (this.isDragging) {
      this.isDragging = false;
      this.scrollContainer.nativeElement.classList.remove('dragging');
      this.startAutoScroll();
    } else {
      this.marqueeScrollSpeed = 0.75;
    }
  }

  onTouchStart(event: TouchEvent) {
    this.isDragging = true;
    this.marqueeStartX = event.touches[0].pageX - this.scrollContainer.nativeElement.offsetLeft;
    this.marqueeScrollLeft = this.scrollContainer.nativeElement.scrollLeft;
    this.stopAutoScroll();
  }

  onTouchMove(event: TouchEvent) {
    if (!this.isDragging) return;

    const x = event.touches[0].pageX - this.scrollContainer.nativeElement.offsetLeft;
    const walk = (x - this.marqueeStartX) * 1;
    this.pendingMarqueeScrollLeft = this.marqueeScrollLeft - walk;

    if (this.scheduledFrame == null) {
      this.scheduledFrame = requestAnimationFrame(() => {
        this.scrollContainer.nativeElement.scrollLeft = this.pendingMarqueeScrollLeft;
        this.scheduledFrame = null;
      });
    }
  }
  onTouchEnd() {
    this.isDragging = false;
    this.startAutoScroll();
  }
  startAutoScroll() {
    const step = () => {
      this.autoScroll();
      this.marqueeScrollId = requestAnimationFrame(step);
    };
    this.marqueeScrollId = requestAnimationFrame(step);
  }
  stopAutoScroll() {
    if (this.marqueeScrollId !== undefined) {
      cancelAnimationFrame(this.marqueeScrollId);
      this.marqueeScrollId = undefined;
    }
  }
  convertFromFIATToCryptoValue(currency?: any, conversionRate?: number): number { // best practice is to ensure currency.fiatRate is set.
    if (currency && (currency.fiatRate || this.btcFiatConversion) && currency.totalBalance) {
      return (conversionRate ? conversionRate : currency.fiatRate ? currency.fiatRate : this.btcFiatConversion ?? 1) * (Number)(currency.totalBalance);
    } else {
      return 0;
    }
  }


  async startTradeBot(coin?: string, strategy: string | undefined = this.selectedTradebotStrategy?.nativeElement?.value) {
    if (!coin) return alert("Error: No coin selected!");
    const user = this.parentRef?.user;
    if (!user?.id || !this.parentRef) {
      alert("You must be logged in.");
      return;
    }
    if (!strategy) {
      alert("No strategy selected");
      return;
    }
    if (!confirm(`Are you sure you want to start the ${coin} trade bot with ${strategy} strategy?`)) {
      this.parentRef.showNotification("Cancelled");
      return;
    }

    try {
      const sessionToken = await this.parentRef.getSessionToken();
      const hasConfig = await this.tradeService.getTradeConfigurationLastUpdated(user.id, sessionToken, coin, "USDC", strategy);
      if (!hasConfig) {
        alert(`You must save a bot configuration for ${strategy} first`);
        return;
      }

      const res = await this.tradeService.startBot(user.id, coin, strategy, sessionToken);
      if (res) {
        this.parentRef.showNotification(res);
        if (res.includes(`has started`)) {
          this.tradeBotStatus[coin] = this.tradeBotStatus[coin] || {};
          this.tradeBotStatus[coin][strategy] = true;
          this.tradeBotStartedSince[coin] = this.tradeBotStartedSince[coin] || {};
          this.tradeBotStartedSince[coin][strategy] = new Date();
        } else {
          this.tradeBotStatus[coin] = this.tradeBotStatus[coin] || {};
          this.tradeBotStatus[coin][strategy] = false;
          this.tradeBotStartedSince[coin] = this.tradeBotStartedSince[coin] || {};
          this.tradeBotStartedSince[coin][strategy] = undefined;
        }
      }
    } catch (error) {
      console.error(`Error starting ${coin} ${strategy} bot:`, error);
      alert("Server Error, Try again later.");
    }
  }
  async stopTradeBot(coin?: string, strategy: string | undefined = this.selectedTradebotStrategy?.nativeElement?.value) {
    if (!coin) return alert("Error: No coin selected!");
    const user = this.parentRef?.user;
    if (!user?.id || !this.parentRef) {
      alert("You must be logged in.");
      return;
    }
    if (!strategy) {
      alert("No strategy selected");
      return;
    }
    if (!confirm(`Are you sure you want to stop the ${coin} trade bot with ${strategy} strategy?`)) {
      this.parentRef.showNotification("Cancelled");
      return;
    }

    try {
      const sessionToken = await this.parentRef.getSessionToken();
      const res = await this.tradeService.stopBot(user.id, coin, strategy, sessionToken);
      if (res) {
        this.parentRef.showNotification(res);
        if (res.includes(`has stopped`)) {
          this.tradeBotStatus[coin] = this.tradeBotStatus[coin] || {};
          this.tradeBotStatus[coin][strategy] = false;
          this.tradeBotStartedSince[coin] = this.tradeBotStartedSince[coin] || {};
          this.tradeBotStartedSince[coin][strategy] = undefined;
        } else {
          this.tradeBotStatus[coin] = this.tradeBotStatus[coin] || {};
          this.tradeBotStatus[coin][strategy] = true;
        }
      }
    } catch (error) {
      console.error(`Error stopping ${coin} ${strategy} bot:`, error);
      alert("Server Error, Try again later.");
    }
  }
  async getLastCoinConfigurationUpdated(from?: string, to?: string, strat?: string) {
    if (!this.parentRef?.user?.id || this.tradeConfigLastUpdated) return;
    const fromCoin = from ?? this.configurationComponent?.tradeFromCoinSelect?.nativeElement.value ?? "BTC";
    const toCoin = to ?? this.configurationComponent?.tradeToCoinSelect?.nativeElement.value ?? "USDC";
    const strategy = strat ?? this.configurationComponent?.tradeStrategySelect?.nativeElement.value ?? "DCA";
    const sessionToken = await this.parentRef.getSessionToken();
    this.hasAnyTradeConfig = false;

    this.tradeConfigLastUpdated = await this.tradeService.getTradeConfigurationLastUpdated(this.parentRef.user.id, sessionToken, fromCoin, toCoin, strategy);
    if (this.tradeConfigLastUpdated) {
      this.hasAnyTradeConfig = true;
    }
  }

  createUpdateUserComponent() {
    this.parentRef?.createComponent('UpdateUserSettings', {
      showOnlyKrakenApiKeys: true,
      showOnlySelectableMenuItems: false,
      areSelectableMenuItemsExplained: false,
      inputtedParentRef: this.parentRef,
      previousComponent: "Crypto-Hub"
    });
  }
  createUserComponent() {
    this.parentRef?.createComponent('User');
  }
  scrollToBottomOfTradebotSimDebug() {
    try {
      this.tradeBotSimDebugDivContainer.nativeElement.scrollTop = this.tradeBotSimDebugDivContainer.nativeElement.scrollHeight;
    } catch (err) {
      console.error('Scroll failed', err);
    }
  }
  scrollToTopOfTradebotSimDebug() {
    try {
      this.tradeBotSimDebugDivContainer.nativeElement.scrollTop = 0;
    } catch (err) {
      console.error('Scroll failed', err);
    }
  }
  
  async changeTimePeriodEventOnCurrencyExchangeGraph(periodSelected: string) {
    this.startLoading();
    const hours = this.tradeService.convertTimePeriodToHours(periodSelected);

    // Clear cache when period changes
    this.exchangeRateCache.clear();
    const targetCurrency = this.selectedCurrency ?? "USD";
    const selectedCurrency = this.selectedFiatConversionName;
    // Get data just once
    //console.log("Fetching exchange rates for graph with period:", periodSelected, "hours:", hours, "selectedCurrency:", selectedCurrency, "targetCurrency:", targetCurrency);
    const exchangeRates = await this.coinValueService.getAllExchangeRateValuesForGraph(new Date(), hours, targetCurrency);

    this.allHistoricalExchangeRateDataForGraph = exchangeRates;
    this.stopLoading();
  }

  async coinConvertSelectChange(selectedCoin?: string, doSelectCoin: boolean = true) {
    this.selectedCoinConversionName = selectedCoin?.replace("Bitcoin", "BTC") ?? this.btcConvertCoinSelect.nativeElement.value;
    setTimeout(async () => {
      if (!doSelectCoin) { 
        await this.handleConversion('BTC', true);
      } else {
        this.selectCoin(this.selectedCoinConversionName);
      }
    });
  }

  async fiatConvertSelectChange() {
    this.selectedFiatConversionName = this.btcConvertFIATSelect.nativeElement.value;
    await this.handleConversion('FIAT', true);
  }

  async getCryptoToFIATRate(coin: string, fiatCurrency: string) {
    let tmpC = coin;
    if (tmpC.toUpperCase() == "BTC") {
      tmpC = "Bitcoin";
    }
    if (fiatCurrency == "CAD") {
      const rate = await this.coinValueService.getLatestCoinValuesByName(tmpC);
      return rate?.valueCAD || 1; // Adjust based on your actual rate property
    } else {
      const rate = await this.coinValueService.getLatestCoinValuesByName(tmpC);
      const tRate = rate?.valueCAD || 1;
      return this.convertFromFIATToCryptoValue(fiatCurrency, tRate);
    }
  } 

  async getLastTradePercentage() {
    if (this.latestTradebotBalance && this.lastTradebotTrade) {
      let tmpCoin = this.latestTradebotBalance.from_currency == "USDC" ?
        this.latestTradebotBalance.to_currency : this.latestTradebotBalance.from_currency;
      if (tmpCoin === "BTC" || tmpCoin == "XBT") tmpCoin = "Bitcoin";
      if (tmpCoin === "ETH") tmpCoin = "Ethereum";
      if (tmpCoin === "XDG") tmpCoin = "Dogecoin";
      if (tmpCoin === "SOL") tmpCoin = "Solana";
      if (tmpCoin.trim() != "") {
        const rateRes = await this.coinValueService.getLatestCoinValuesByName(tmpCoin);
        const price = parseFloat(this.latestTradebotBalance.coin_price_usdc);
        const rate = rateRes?.valueUSD ?? 1;
        this.lastTradePercentage = ((rate - price) / price) * 100;
      }
    } else {
      this.lastTradePercentage = 0;
    }
  }

  async getLastTradebotTradeDisplay() { 
    const session = await this.parentRef?.getSessionToken() ?? "";
    const res = await this.tradeService.getLatestTradeHistory(this.parentRef?.user?.id ?? 1, session);
    this.latestTradebotBalance = res;
    const value = res.value;
    const price = parseFloat(res.coin_price_usdc);
    const buyOrSell = res.to_currency == "USDC" ? "Sell" : "Buy";
    const timestamp = this.getUtcTimeSince(res.timestamp);
    const vp = parseFloat(value) * price;
    this.lastTradebotTrade = {
      'timestamp': timestamp,
      'buyOrSell': buyOrSell,
      'value': value,
      'fromCoin': res.from_currency,
      'toCoin': res.to_currency,
      'valuePrice': this.formatToCanadianCurrency(vp),
      'tradePrice': this.formatToCanadianCurrency(price),
      'strategy': res.strategy
    };
     
  }
  async enterPosition() {
    if (!this.hasKrakenApi) {
      return alert("You must have Kraken API keys configured.");
    }
    const userId = this.parentRef?.user?.id;
    if (!userId || userId == 0 || !this.parentRef) return alert("You must be logged in to enter position.");
    let selectedCurrency = this.selectedTradebotCurrency?.nativeElement.value;
    let selectedStrategy = this.selectedTradebotStrategy?.nativeElement.value;
    if (!selectedCurrency || !selectedStrategy) { return alert("A currency and strategy must be selected!"); }
    this.startLoading();
    let btcPurchaseAmount;
    const krakenUsdcCurrencyWallet = (this.wallet ?? [])
      .flatMap(walletItem => walletItem.currencies || [])
      .filter(currency =>
        currency.address === "Kraken" && currency.currency === "USDC"
      )[0];
    let currentUSDC = parseFloat(krakenUsdcCurrencyWallet?.totalBalance ?? "0");
    if (!this.wallet || !currentUSDC) {
      return alert("Either you have no USDC available or wallet data has not yet fully loaded. Verify and retry.");
    }
    const sessionToken = await this.parentRef.getSessionToken();
    const tc = await this.tradeService.getTradeConfiguration(userId, sessionToken ?? "", selectedCurrency, "USDC", selectedStrategy);


    const coinNameMap: { [key: string]: string } = {
      ETH: "Ethereum",
      XDG: "Dogecoin",
      BTC: "Bitcoin",
      XBT: "Bitcoin",
      SOL: "Solana"
    };

    let tmpCoinName = coinNameMap[selectedCurrency] || selectedCurrency;
    let currencyRate = await this.coinValueService.getCurrencyConversionRate(tmpCoinName, "USDC");
    let coinPrice = this.formatToCanadianCurrency(currencyRate ?? 0);
    let btcPurchaseCost = currencyRate;
    if (tc) {
      btcPurchaseAmount = tc.maximumToTradeAmount;
      btcPurchaseAmount = Math.min(btcPurchaseAmount, currentUSDC) / currencyRate;
      btcPurchaseCost = Math.min(btcPurchaseAmount, currentUSDC) * currencyRate;
    } else {
      return alert(`No trade configuration for ${selectedCurrency} / USDC pairs and ${selectedStrategy} strategy. Cancelled.`);
    }
    if (!btcPurchaseAmount) {
      return alert(`Data integrity issue or no USDC to trade. Try again. strategy: ${selectedStrategy}, btcPurchaseAmount: ${btcPurchaseAmount}, currentUSDC: ${currentUSDC}, btcUSDRate: ${this.btcUSDRate}`);
    }
    this.stopLoading();
    if (!confirm(`Purchase ${btcPurchaseAmount.toFixed(8)} ${selectedCurrency} for ${this.formatToCanadianCurrency(btcPurchaseCost)}?\n- ${selectedCurrency} USDC Price: ${coinPrice}\n- USDC Balance: ${this.formatToCanadianCurrency(currentUSDC)}`)) { return alert("Cancelled"); }
    if (!confirm(`Purchasing ${btcPurchaseAmount.toFixed(8)} ${selectedCurrency} for ${this.formatToCanadianCurrency(btcPurchaseCost)}.`)) { return alert("Cancelled"); }
    this.tradeService.enterPosition(userId, selectedCurrency, selectedStrategy, sessionToken).then(res => {
      if (res) {
        this.parentRef?.showNotification(`${selectedCurrency} (${selectedStrategy}) Position entered.`);
      } else {
        this.parentRef?.showNotification(`Error entering ${selectedCurrency} (${selectedStrategy}) position.`);
      }
    });
  }
  async exitPosition() {
    const userId = this.parentRef?.user?.id;
    let selectedCurrency = this.selectedTradebotCurrency?.nativeElement.value;
    let selectedStrategy = this.selectedTradebotStrategy?.nativeElement.value;

    if (!selectedCurrency || !selectedStrategy) { return alert("A currency and strategy must be selected!"); }
    if (!userId || userId == 0) return alert("You must be logged in to exit your position.");
    this.startLoading();
    const krakenBTCCurrencyWallet = (this.wallet ?? [])
      .flatMap(walletItem => walletItem.currencies || [])
      .filter(currency =>
        currency.address === "Kraken" && currency.currency === selectedCurrency
      )[0];
    let currentBTC = parseFloat(krakenBTCCurrencyWallet?.totalBalance ?? "0");

    const coinNameMap: { [key: string]: string } = {
      ETH: "Ethereum",
      XDG: "Dogecoin",
      BTC: "Bitcoin",
      XBT: "Bitcoin",
      SOL: "Solana"
    };

    let tmpCoinName = coinNameMap[selectedCurrency] || selectedCurrency;
    let currencyRate = await this.coinValueService.getCurrencyConversionRate(tmpCoinName, "USDC");
    let sellPreview = currentBTC * (currencyRate ?? 0);
    this.stopLoading();
    if (!confirm(`Sell ${currentBTC.toFixed(8)} ${selectedCurrency} for ${this.formatToCanadianCurrency(sellPreview)}?\n- ${selectedCurrency} USDC Price: ${this.formatToCanadianCurrency(currencyRate ?? 0)} (${selectedStrategy})`)) { return alert("Cancelled"); }
    if (!confirm(`Selling ${currentBTC.toFixed(8)} ${selectedCurrency} for ${this.formatToCanadianCurrency(sellPreview)} (${selectedStrategy})`)) { return alert("Cancelled"); }

    const sessionToken = await this.parentRef?.getSessionToken() ?? "";
    this.tradeService.exitPosition(userId, selectedCurrency, selectedStrategy, sessionToken).then(res => {
      if (res) {
        this.parentRef?.showNotification(`${selectedCurrency} (${selectedStrategy}) Position Exited.`);
      } else {
        this.parentRef?.showNotification(`Error exiting ${selectedCurrency} (${selectedStrategy}) position.`);
      }
    });
  }
  canShowTradePanelInfo() {
    return !this.isShowingTradeProfit && !this.isTradeLiveViewShowing  && !this.showingTradeSettings && !this.showingTradeLogs && !this.isShowingTradeValueGraph && !this.isShowingTradeSimulator && !this.isTradeInformationOpen && !this.isTradebotBalanceShowing && !this.showingTradeLogs && !this.isShowingTradeValueGraph && !this.isShowingTradeSimulator && !this.isTradeInformationOpen;
  }
  async showProfit() {
    if (this.isShowingTradeProfit) {
      this.isShowingTradeProfit = false;
      this.closeTradeDivs();
    } else {
      const sessionToken = await this.parentRef?.getSessionToken() ?? "";
      await this.getProfitData(!this.hasKrakenApi ? 1 : (this.parentRef?.user?.id ?? 1), sessionToken);
      this.isShowingTradeProfit = true;
    }
  }
  hideProfit() {
    this.isShowingTradeProfit = false;
    this.closeTradeDivs();
  }
  toggleProfitSection(section: string): void {
    this.openProfitSections[section] = !this.openProfitSections[section];
  }

  isProfitSectionOpen(section: string): boolean {
    return this.openProfitSections[section];
  }

  getProfitPeriodsByType(type: string): any[] {
    return this.profitData.filter(period => period.periodType === type);
  }
  getRatioTier(tratio?: string): string {
    if (!tratio) return "";
    const ratio = parseInt(tratio);
    if (!ratio) return "";
    if (ratio < 10) return "Balanced";
    if (ratio < 100) return "USDC Mild Dominance";
    if (ratio < 1000) return "USDC Strong Dominance";
    return "USDC Extreme Dominance";
  }
  autoScroll() {
    if (this.isDragging) return;

    const container = this.scrollContainer.nativeElement;
    const content = container.querySelector('.marquee-content');
    if (!content || container.scrollWidth <= container.clientWidth) return;

    const max = content.scrollWidth - container.clientWidth;

    container.scrollLeft += this.marqueeScrollSpeed;

    // When we hit the end
    if (Math.ceil(container.scrollLeft) >= max) {
      this.stopAutoScroll();

      // Defer the reset to the next frame to avoid layout conflicts
      requestAnimationFrame(() => {
        container.scrollLeft = 0;

        // Then resume auto-scroll after one more frame
        requestAnimationFrame(() => {
          this.startAutoScroll();
        });
      });
    }
  }
  get loopedData() {
    if (!this.latestCoinValueData || this.latestCoinValueData.length === 0) return [];
    return [...this.latestCoinValueData, this.latestCoinValueData[0]]; // duplicate the first item at the end
  }

  getRSIStatus(rsi: number): { class: string; label: string } {
    if (rsi >= 70) {
      return { class: 'redText', label: 'Overbought' };
    } else if (rsi <= 30) {
      return { class: 'greenText', label: 'Oversold' };
    } else if (rsi <= 70 && rsi >= 50) {
      return { class: 'greenText', label: 'Bullish' };
    } else {
      return { class: '', label: 'Neutral' };
    }
  }
  isTradeBotStarted(currency?: string, strategy: string = 'DCA'): boolean {
    if (!currency || !strategy) return false;
    return this.tradeBotStatus[currency]?.[strategy] || false;
  }
  getActiveTradeBots(): { currency: string, strategy: string, startedSince: string }[] {
    if (this.activeTradeBots) { return this.activeTradeBots;}
    const activeBots: { currency: string, strategy: string, startedSince: string }[] = [];
    for (const currency in this.tradeBotStatus) {
      if (this.tradeBotStatus.hasOwnProperty(currency)) {
        for (const strategy in this.tradeBotStatus[currency]) {
          if (this.tradeBotStatus[currency].hasOwnProperty(strategy) && this.tradeBotStatus[currency][strategy]) {
            const startedSince = this.tradeBotStartedSince[currency]?.[strategy] + '' || 'Unknown';
            activeBots.push({ currency, strategy, startedSince });
          }
        }
      }
    }
    this.activeTradeBots = activeBots;
    return activeBots;
  }
  currencySelectTradebotEngage() {
    this.changeDetectorRef.detectChanges();
  }
  openMarketSentimentPopup() {
    this.isMarketSentimentMaximized = true;
    this.parentRef?.showOverlay();
  }
  closeMarketSentimentPopup() {
    this.parentRef?.closeOverlay();
    setTimeout(() => {
      this.isMarketSentimentMaximized = false;
    }, 50);
  }

  /** Derived helpers */
  get totalSentimentPages(): number {
    return Math.ceil(this.marketSentimentData.length / this.sentimentPageSize) || 1;
  }
  get sentimentPageData(): SentimentEntry[] {
    const start = (this.currentSentimentPage - 1) * this.sentimentPageSize;
    return this.marketSentimentData.slice(start, start + this.sentimentPageSize);
  }

  /** Latest row is always index 0 in the master array */
  isLatestSentiment(item: SentimentEntry): boolean {
    return this.marketSentimentData[0] === item;
  }

  /** Pagination controls */
  nextSentimentPage(): void {
    if (this.currentSentimentPage < this.totalSentimentPages) this.currentSentimentPage++;
  }
  prevSentimentPage(): void {
    if (this.currentSentimentPage > 1) this.currentSentimentPage--;
  }

  /** Toggle row expansion (ignored for latest row) */
  toggleSentiment(item: SentimentEntry): void {
    if (!this.isLatestSentiment(item)) item.expanded = !item.expanded;
  }
  
  onIndicatorPairChange() {
    const selected = this.availableIndicatorPairs.find(p => p.value === this.tradeIndicatorSelect.nativeElement.value);
    this.selectedIndicatorPair = this.tradeIndicatorSelect.nativeElement.value;
    if (selected) {
      this.loadIndicators(selected.fromCoin);
    }
  }

  async loadIndicators(fromCoin?: string) {
    let tmpIndicatorNames: string[] = [];
    tmpIndicatorNames.push("XBT", "XRP", "SOL", "XDG", "ETH");
    // Check cache first
    for (let x = 0; x < tmpIndicatorNames.length; x++) {
      const cacheKey = `${tmpIndicatorNames[x]}-USDC`;
      if (this.indicatorCache.has(cacheKey)) {
        if (tmpIndicatorNames[x] === fromCoin) {
          this.tradeIndicators = this.indicatorCache.get(cacheKey)!;
        }
        this.normalizeCoinName(); // in case of XBT => BTC replacement
        continue;
      }

      this.startLoading();

      await this.tradeService.getTradeIndicators(tmpIndicatorNames[x], 'USDC').then(res => {
        if (res) {
          if (tmpIndicatorNames[x] === fromCoin) {
            this.tradeIndicators = res;
          }
          this.normalizeCoinName();
          if (res) {
            this.indicatorCache.set(cacheKey, res);
          }
        }
        this.stopLoading();
      }).catch(err => {
        console.error('Error loading indicators:', err);
        this.stopLoading();
      });
    }

    this.checkBullishIndicators();
  }
  private normalizeCoinName() {
    if (this.tradeIndicators?.fromCoin === 'XBT') {
      this.tradeIndicators.fromCoin = 'BTC';
    }
  }
  checkBullishIndicators() {
    this.bullishCoins = [];
    for (const [key, indicators] of this.indicatorCache.entries()) {
      const [fromCoin, toCoin] = key.split('-');
      const rsi = indicators.rsI14Day;
      const rsiBullish =
        (rsi < 30) ||     // Reversal zone
        (rsi >= 50 && rsi <= 70); // Trending bullish
      const macdBullish = (indicators.macdLineValue - indicators.macdSignalValue) > 0;
      const hasSignal =
        indicators.twoHundredDayMA &&
        indicators.fourteenDayMA &&
        indicators.twentyOneDayMA &&
        rsiBullish &&
        macdBullish &&
        indicators.vwaP24Hour;

      if (hasSignal) {
        this.bullishCoins.push(`${fromCoin}/${toCoin}`);
      }
    }
  }
  async openMacdPopup() {
    this.isMacdPopupOpen = true;
    this.parentRef?.showOverlay();
    await this.loadMacdGraphData();
  }

  closeMacdPopup() {
    this.isMacdPopupOpen = false;
    setTimeout(() => {
      this.parentRef?.closeOverlay(false);
    }, 50);
    this.macdGraphData = []; // Clear data on close
  }

  async loadMacdGraphData() {
    try {
      const days = 14; // Match backend default
      const fastPeriod = 12; // Match backend default
      const slowPeriod = 26; // Match backend default
      const signalPeriod = 9; // Match backend default
      const [fromCoin, toCoin] = this.selectedIndicatorPair.split('/');
      const data = await this.tradeService.getMacdData(
        fromCoin,
        toCoin,
        days,
        fastPeriod,
        slowPeriod,
        signalPeriod
      );
      this.macdGraphData = data.map((point: any) => ({
        timestamp: point.timestamp, // ISO string, e.g., "2025-07-01T00:00:00Z"
        macdLine: point.macdLine != null ? Number(point.macdLine) : null,
        signalLine: point.signalLine != null ? Number(point.signalLine) : null,
        histogram: point.histogram != null ? Number(point.histogram) : null,
        price: point.price != null ? Number(point.price) : null
      }));
    } catch (error) {
      console.error('Error loading MACD data:', error);
      this.macdGraphData = [];
    }
  }

  onSmallLogClick() {
    if (!this.showingTradeLogs) {
      this.showTradeLogs();
    }
  }
  closeCryptoBotConfigEmitter() {
    setTimeout(() => {
      this.closeTradeDivs();
    }, 50);
  }
  formatLargeNumber(number: number) {
    return this.tradeService.formatLargeNumber(number);
  }
  tradePanelToolSelectChange() {
    this.changeDetectorRef.detectChanges();
  }
  getToolVisibility(tool?: string): boolean {
    if (!tool) return false;
    return this.isDataToolVisible[tool as ToolKey];
  }

  toggleSelectedDataTool(tool?: string): void {
    const key = tool as ToolKey;
    this.isDataToolVisible[key] = !this.isDataToolVisible[key];
    if (key == "profit") {
      if (!this.isShowingTradeProfit) {
        this.closeTradeInformationPanel();
        setTimeout(() => { this.showProfit(); }, 50);
      } else { this.hideProfit() }
    }
    else if (key == 'sim') {
      if (!this.isShowingTradeSimulator) {
        this.closeTradeInformationPanel();
        setTimeout(() => { this.showTradeSimulationPanel(); }, 50);
      } else { this.closeTradeSimulationPanel() }
    }
    else if (key == 'graph') {
      this.closeTradeInformationPanel();
      setTimeout(() => { this.showTradeValueGraph(); }, 50);
    }
    setTimeout(() => {
      this.changeDetectorRef.detectChanges();
    }, 50);
  }

  getToolLabel(tool?: string): string {
    switch (tool) {
      case 'profit': return 'Profit and Loss';
      case 'graph': return 'Trade Value Graph';
      case 'sim': return 'Tradebot Simulation';
      default: return '';
    }
  }
  groupedBotsDisplay() {
    const groups: { strategy: string, currencies: string[], startedSince: string }[] = [];
    const bots = this.getActiveTradeBots();

    // Group bots by strategy
    const strategyMap = new Map<string, { currencies: string[], startedSince: string }>();

    bots.forEach(bot => {
      if (!strategyMap.has(bot.strategy)) {
        strategyMap.set(bot.strategy, {
          currencies: [],
          startedSince: bot.startedSince
        });
      }
      strategyMap.get(bot.strategy)!.currencies.push(bot.currency);
    });

    // Convert map to array
    strategyMap.forEach((value, key) => {
      groups.push({
        strategy: key,
        currencies: value.currencies,
        startedSince: value.startedSince
      });
    });

    return groups;
  }
  getActiveTradebotCoins(): string[] {
    const activeCoins = ['BTC']; // Always include BTC
    const activeBots = this.getActiveTradeBots();

    if (activeBots.some(bot => bot.currency === 'ETH')) activeCoins.push('ETH');
    if (activeBots.some(bot => bot.currency === 'SOL')) activeCoins.push('SOL');
    if (activeBots.some(bot => bot.currency === 'XRP')) activeCoins.push('XRP');
    if (activeBots.some(bot => bot.currency === 'XDG')) activeCoins.push('DOGE');

    return activeCoins;
  }

  getTradebotCoinPrice(coin: string): number {
    switch (coin) {
      case 'BTC': return this.btcToCadPrice * (this.latestCurrencyPriceRespectToCAD ?? 1);
      case 'ETH': return this.ethToCadPrice * (this.latestCurrencyPriceRespectToCAD ?? 1);
      case 'SOL': return this.solToCadPrice * (this.latestCurrencyPriceRespectToCAD ?? 1);
      case 'XRP': return this.xrpToCadPrice * (this.latestCurrencyPriceRespectToCAD ?? 1);
      case 'DOGE': return this.xdgToCadPrice * (this.latestCurrencyPriceRespectToCAD ?? 1);
      default: return 0;
    }
  }
  private getNumberOfTrades() {
    const parent = this.parentRef;
    const user = parent?.user;
    if (user?.id) {
      this.tradeService.getNumberOfTrades(user.id).then(res => {
        if (res) {
          this.numberOfTrades = res ?? 0;
        }
      });
    }
  }
  fullscreenSelectedInPopup(event?: any) {
    this.isGraphFullscreenedInPopup = !this.isGraphFullscreenedInPopup;
  }
}

interface VolumeWarning {
  level: 'none' | 'mild' | 'severe';
  description: string;
}

interface VolumeDisplayData {
  btc: number;
  usdc: number;
  btcInUSDC: number;
  btcPercentage: number;
  usdcPercentage: number;
  btcPrice: number;
  ratio: string;
  timestamp: Date;
  dominanceDescription: string;
  warnings: {
    usdc: VolumeWarning;
    btc: VolumeWarning;
  };
  // Keep the legacy warningLevel for backward compatibility if needed
  warningLevel?: 'none' | 'mild' | 'severe';
}
interface IndicatorData {
  fromCoin: string;
  toCoin: string;
  twoHundredDayMA: boolean;
  twoHundredDayMAValue: number;
  fourteenDayMA: boolean;
  fourteenDayMAValue: number;
  twentyOneDayMA: boolean;
  twentyOneDayMAValue: number;
  rsI14Day: number;
  vwaP24Hour: boolean;
  vwaP24HourValue: number;
  retracementFromHigh: boolean;
  retracementFromHighValue: number;
  highPriceValue: number;
  macdHistogram: boolean;
  macdLineValue: number;
  macdSignalValue: number;
  volumeAbove20DayAverage: boolean;
  volume20DayAverageValue: number;
  currentVolumeValue: number;
}
export interface SentimentEntry {
  sentimentScore: number;
  analysis: string;
  createdUtc: Date;
  expanded?: boolean;
}
type ToolKey = 'profit' | 'graph' | 'sim';
