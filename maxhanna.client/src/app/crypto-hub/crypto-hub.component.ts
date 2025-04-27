import { Component, ElementRef, EventEmitter, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { Currency, MiningWalletResponse, Total } from '../../services/datacontracts/crypto/mining-wallet-response';
import { CoinValue } from '../../services/datacontracts/crypto/coin-value';
import { ExchangeRate } from '../../services/datacontracts/crypto/exchange-rate';
import { LineGraphComponent } from '../line-graph/line-graph.component';
import { CoinValueService } from '../../services/coin-value.service';
import { MiningRigsComponent } from '../mining-rigs/mining-rigs.component';
import { AiService } from '../../services/ai.service';
import { TradeService } from '../../services/trade.service';


@Component({
  selector: 'app-crypto-hub',
  templateUrl: './crypto-hub.component.html',
  styleUrl: './crypto-hub.component.css',
  standalone: false
})
export class CryptoHubComponent extends ChildComponent implements OnInit, OnDestroy {
  wallet?: MiningWalletResponse[] | undefined;
  btcFiatConversion?: number = 0;
  currentSelectedCoin: string = 'Bitcoin';
  selectedCurrency?: string = undefined;
  selectedFiatConversionName?: string = undefined;
  selectedCoinConversionName: string = "BTC";
  noMining = false;
  isDiscreete = false;
  data?: CoinValue[];
  allHistoricalData?: CoinValue[] = [];
  volumeData?: any[] = undefined;
  allHistoricalDataPreCalculation?: CoinValue[] = [];
  allWalletBalanceData?: CoinValue[] = [];
  allHistoricalExchangeRateData?: ExchangeRate[] = [];
  allHistoricalExchangeRateDataForGraph?: ExchangeRate[] = [];
  fiatNames: string[] = [];
  coinNames: string[] = [];
  btcWalletResponse?: MiningWalletResponse = undefined;
  btcToCadPrice = 0;
  isAddCryptoDivVisible = false;
  areWalletAddressesHidden = true;
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
  isWalletGraphFullscreened = false;
  hostAiToggled = false;
  popupHostAiToggled = false;
  hasKrakenApi = false;
  tradeBotStarted = false;
  tradeBotStartedSince: undefined | Date = undefined;
  showingTradeSettings = false;
  showingTradeLogs = false;
  isTradePanelOpen = false;
  isShowingTradeGraphWrapper = false;
  isShowingTradeValueGraph = false;
  tradeConfigLastUpdated?: Date = undefined;
  hasAnyTradeConfig = false;
  tradeLogs: any[] = []
  paginatedLogs: any[] = [];
  currentLogPage = 1;
  logsPerPage = 10;
  totalLogPages = 0;
  fullscreenTimeout = false;
  isTradeInformationOpen = false;
  isShowingTradeSimulator = false;
  weightedAveragePrices?: any;
  private exchangeRateCache = new Map<string, {
    baseRates: ExchangeRate[];
    targetRates: ExchangeRate[];
    baseTimestamps: number[];
    targetTimestamps: number[];
  }>();
  isDragging = false;
  startX = 0;
  scrollLeft = 0;
  scrollInterval: any;
  isTradebotBalanceShowing = false;
  tradebotBalances?: {
    id: number,
    user_id: number,
    from_currency: string,
    to_currency: string,
    value: string,
    btc_price_cad: string,
    btc_price_usdc: string,
    trade_value_cad: string,
    trade_value_usdc: string,
    fees: number,
    timestamp: Date
  }[] = undefined;
  tradebotValuesForGraph: any;
  tradebotTradeValuesForMainGraph: { timestamp: Date; valueCAD: number }[] = [];
  lineGraphInitialPeriod: '5min' | '15min' | '1h' | '6h' | '12h' | '1d' | '2d' | '5d' | '1m' | '2m' | '3m' | '6m' | '1y' | '2y' | '3y' | '5y' = '6h';
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
  @ViewChild('scrollContainer', { static: true }) scrollContainer!: ElementRef;
  @ViewChild(LineGraphComponent) lineGraphComponent!: LineGraphComponent;
  @ViewChild(LineGraphComponent) simLineGraph!: LineGraphComponent;
  @ViewChild(LineGraphComponent) currencyExchangeLineGraph!: LineGraphComponent;
  @ViewChild('miningRigComponent') miningRigComponent!: MiningRigsComponent;
  @ViewChild('convertSATInput') convertSATInput!: ElementRef<HTMLInputElement>;
  @ViewChild('convertCurrencyInput') convertCurrencyInput!: ElementRef<HTMLInputElement>;
  @ViewChild('convertBTCInput') convertBTCInput!: ElementRef<HTMLInputElement>;
  @ViewChild('convertFIATInput') convertFIATInput!: ElementRef<HTMLInputElement>;
  @ViewChild('btcConvertFIATSelect') btcConvertFIATSelect!: ElementRef<HTMLSelectElement>;
  @ViewChild('btcConvertCoinSelect') btcConvertCoinSelect!: ElementRef<HTMLSelectElement>;
  @ViewChild('selectedCurrencyDropdown') selectedCurrencyDropdown!: ElementRef<HTMLSelectElement>;
  @ViewChild('newWalletInput') newWalletInput!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeFromCoinSelect') tradeFromCoinSelect!: ElementRef<HTMLSelectElement>;
  @ViewChild('tradeToCoinSelect') tradeToCoinSelect!: ElementRef<HTMLSelectElement>;
  @ViewChild('tradeMaximumFromTradeAmount') tradeMaximumFromTradeAmount!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeMaximumToTradeAmount') tradeMaximumToTradeAmount!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeMinimumFromTradeAmount') tradeMinimumFromTradeAmount!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeMinimumToTradeAmount') tradeMinimumToTradeAmount!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeTradeThreshold') tradeTradeThreshold!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeMaximumTradeBalanceRatio') tradeMaximumTradeBalanceRatio!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeValueTradePercentage') tradeValueTradePercentage!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeFromPriceDiscrepencyStopPercentage') tradeFromPriceDiscrepencyStopPercentage!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeInitialMinimumFromAmountToStart') tradeInitialMinimumFromAmountToStart!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeMinimumFromReserves') tradeMinimumFromReserves!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeMinimumToReserves') tradeMinimumToReserves!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeTradeMaximumTypeOccurances') tradeTradeMaximumTypeOccurances!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeBotSimDebugDivContainer') tradeBotSimDebugDivContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('initialBtcUsd') initialBtcUsd!: ElementRef<HTMLInputElement>;
  @ViewChild('initialUsdc') initialUsdc!: ElementRef<HTMLInputElement>;
  @ViewChild('initialBtcPrice') initialBtcPrice!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeSpreadPct') tradeSpreadPct!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeFeePct') tradeFeePct!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeAmountPct') tradeAmountPct!: ElementRef<HTMLInputElement>;
  @ViewChild('numOscillations') numOscillations!: ElementRef<HTMLInputElement>;

  @Output() coinSelected = new EventEmitter<string>();

  constructor(
    private coinValueService: CoinValueService,
    private aiService: AiService,
    private tradeService: TradeService) {
    super();
  }
  async ngOnInit() {
    if (!this.onMobile()) {
      this.logsPerPage = 30;
    }
    this.startAutoScroll();
    this.startLoading();
    try {
      this.parentRef?.addResizeListener();
      await this.getUserCurrency();
      await this.coinValueService.getLatestCoinValuesByName("Bitcoin").then(res => { if (res && res.valueCAD) this.btcFiatConversion = res.valueCAD; });
      this.getBTCWallets();
      this.getIsTradebotStarted();
      this.coinValueService.getLatestCoinValues().then((res: CoinValue[]) => {
        this.data = res;
        this.coinNames = res.map(x => x.name.replace("Bitcoin", "BTC")).filter((name, index, arr) => arr.indexOf(name) === index);
      });
      this.coinValueService.getAllExchangeRateValuesForGraph(new Date(), 356 * 24).then(async res => {
        if (res) {
          this.allHistoricalExchangeRateData = res;
          const currencyRate = await this.getCurrencyToCadRate(this.selectedCurrency ?? "CAD");
          // First collect all currencies
          const allCurrencies: string[] = [];
          this.allHistoricalExchangeRateData?.forEach(element => {
            if (element.targetCurrency && !allCurrencies.includes(element.targetCurrency)) {
              allCurrencies.push(element.targetCurrency);
            }
            const tmpelement = { ...element };
            tmpelement.rate = tmpelement.rate * currencyRate; 
            this.allHistoricalExchangeRateDataForGraph?.push(tmpelement);
          });

          // Define the priority order for popular currencies
          const popularCurrenciesOrder = [
            'USD', 'EUR', 'GBP', 'JPY', 'CAD',
            'AUD', 'CHF', 'CNY', 'NZD', 'SGD'
          ];

          // Reorder currencies - popular first, then others alphabetically
          this.fiatNames = [
            // Popular currencies in defined order (only those that exist in our data)
            ...popularCurrenciesOrder.filter(currency =>
              allCurrencies.includes(currency)
            ),

            // Other currencies sorted alphabetically
            ...allCurrencies
              .filter(currency =>
                !popularCurrenciesOrder.includes(currency)
              )
              .sort((a, b) => a.localeCompare(b))
          ];
        }
      });
      if (this.parentRef?.user?.id) {
        await this.tradeService.hasApiKey(this.parentRef.user.id).then(res => {
          this.hasKrakenApi = res;
        });
        this.getLastCoinConfigurationUpdated("", "");
      }
      this.coinValueService.getLatestCoinValuesByName("Bitcoin").then(res => {
        if (res) {
          this.btcToCadPrice = res.valueCAD;
          if (!this.btcFiatConversion) {
            this.btcFiatConversion = res.valueCAD;
          }
        }
      });
 
      const ceRes = await this.coinValueService.getLatestCurrencyValuesByName(this.selectedCurrency) as ExchangeRate;
      if (ceRes) {
        this.latestCurrencyPriceRespectToCAD = ceRes.rate;
      }

      const ceRes2 = await this.coinValueService.getLatestCurrencyValuesByName(this.selectedFiatConversionName) as ExchangeRate;
      if (ceRes2) {
        this.latestCurrencyPriceRespectToFIAT = ceRes2.rate;
      }
      const hours = this.convertTimePeriodToHours(this.lineGraphInitialPeriod); 
      const startTime = new Date();
      startTime.setHours(startTime.getHours() - hours);
      await this.coinValueService.getAllCoinValuesForGraph(new Date(), hours).then(res => {
        if (res) {
          this.allHistoricalDataPreCalculation = res;
          this.allHistoricalData = res.filter((x: any) => x.name == 'Bitcoin');
          this.allHistoricalData?.forEach(x => x.valueCAD = x.valueCAD * this.latestCurrencyPriceRespectToCAD);
        }
      });
      const sessionToken = await this.parentRef?.getSessionToken();
      const tradeUserId = this.hasKrakenApi ? this.parentRef?.user?.id ?? 1 : 1;
      this.getTradebotValuesForMainGraph(tradeUserId, sessionToken);
      await this.tradeService.getTradeVolumeForGraph(new Date(), hours).then(res => {
        this.volumeData = res.map((item: any) => ({
          timestamp: item.timestamp,
          valueCAD: item.volumeBTC
        }));
      });

      if (!this.weightedAveragePrices) {
        this.tradeService.getWeightedAveragePrices(this.parentRef?.user?.id ?? 1, sessionToken ?? "").then(res => {
          if (res) {
            this.weightedAveragePrices = res;
          }
        });
      }
    } catch (error) {
      console.error('Error fetching coin values:', error);
    }
    setTimeout(() => { this.convertCoinInputted(); }, 50);
    this.getCurrencyToCadRate("usd").then(res => {
      this.cadToUsdRate = res;
      this.btcUSDRate = this.btcToCadPrice / this.cadToUsdRate; 
    });   
    this.stopLoading();
  }
  private async getTradebotValuesForMainGraph(tradeUserId: number, sessionToken: string | undefined) {
    await this.tradeService.getTradeHistory(tradeUserId, sessionToken ?? "").then(res => {
      if (res) {
        this.tradebotBalances = res;
        this.tradebotTradeValuesForMainGraph = res.map((x: any) => {
          return {
            timestamp: x.timestamp,
            valueCAD: parseFloat(x.btc_price_cad) * this.latestCurrencyPriceRespectToCAD,
            type: x.from_currency == "XBT" ? 'sell' : 'buy'
          };
        });
      }
    });
  }

  private async getUserCurrency() {
    const user = this.parentRef?.user;
    if (user?.id) {
      await this.coinValueService.getUserCurrency(user.id).then(async (res) => {
        if (res) {
          if (res.includes("not found")) {
            this.selectedCurrency = "CAD";
            this.selectedFiatConversionName = this.selectedCurrency == 'USD' ? "CAD" : "USD";

          } else {
            this.selectedCurrency = res;
            this.selectedFiatConversionName = this.selectedCurrency == 'USD' ? "CAD" : "USD";

          }
        }
      });
    } else {
      this.selectedCurrency = "CAD";
      this.selectedFiatConversionName = this.selectedCurrency == 'USD' ? "CAD" : "USD";

    }
  }

  ngOnDestroy() {
    clearInterval(this.scrollInterval);
    this.parentRef?.removeResizeListener();
  }
  private async getIsTradebotStarted() {
    const parent = this.parentRef;
    if (parent && parent.user?.id) {
      const sessionToken = await parent.getSessionToken();
      const res = await this.tradeService.isTradebotStarted(parent.user.id, sessionToken);
      if (res) {
        this.tradeBotStartedSince = res as Date;
      }
      if (this.tradeBotStartedSince) {
        this.tradeBotStarted = true;
      } else {
        this.tradeBotStarted = false;
      }
    } else {
      this.tradeBotStarted = false;
    }
  }
  private async getBTCWallets() {
    this.wallet = this.wallet || [];
    const user = this.parentRef?.user;
    const token = await this.parentRef?.getSessionToken();
    if (user?.id) {
      await this.coinValueService.getWallet(user.id, token ?? "").then(res => {
        if (res && res.length > 0) {
          this.wallet = res;
        }
      });
    }

    if (this.wallet) {
      for (let type of this.wallet) {
        type.total = {
          currency: "Total " + (type.total && type.total.currency ? type.total.currency.toUpperCase() : ""),
          totalBalance: (type.currencies ?? [])
            .filter(x => x.currency?.toUpperCase() === (type.total && type.total.currency ? type.total.currency.toUpperCase() : ""))
            .reduce((sum, curr) => sum + Number(curr.totalBalance || 0), 0)
            .toString(),
          available: (type.currencies ?? [])
            .filter(x => x.currency?.toUpperCase() === (type.total && type.total.currency ? type.total.currency.toUpperCase() : ""))
            .reduce((sum, curr) => sum + Number(curr.available || 0), 0)
            .toString(),
        };
      }
    }
    const krakenUsdcCurrencyWallet = this.wallet
      .flatMap(walletItem => walletItem.currencies || [])
      .filter(currency =>
        currency.address === "Kraken" && currency.currency === "USDC"
      )[0];
    const krakenBtcCurrencyWallet = this.wallet
      .flatMap(walletItem => walletItem.currencies || [])
      .filter(currency =>
        currency.address === "Kraken" && currency.currency === "BTC"
      )[0];
    this.tradeSimParams.initialBtc = parseFloat(krakenBtcCurrencyWallet.totalBalance ?? "");
    this.tradeSimParams.initialUsd = parseFloat(krakenUsdcCurrencyWallet.totalBalance ?? "");
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
    if (!coinName.includes("BTC") && !coinName.includes("Bitcoin")) {
      this.tradebotTradeValuesForMainGraph = [];
    } else {
      if (!this.tradebotTradeValuesForMainGraph || this.tradebotTradeValuesForMainGraph.length == 0) { 
        const userId = this.parentRef?.user?.id ?? 1;
        const sessionToken = await this.parentRef?.getSessionToken();
        await this.getTradebotValuesForMainGraph(userId, sessionToken);
      }
    }
    this.coinSelected.emit(this.currentSelectedCoin = coinName === "Total BTC" || coinName === "BTC" ? "Bitcoin" : coinName);
    setTimeout(() => { this.changeTimePeriodEventOnBTCHistoricalGraph('6h') }, 50);
  }

  async convertFIATInputted() {
    const inputValue = parseFloat(this.convertFIATInput.nativeElement.value ?? 1);
    let coinValue = { valueCAD: 0 };
    const cRes = await this.coinValueService.getAllCoinValuesForGraph(new Date(), 0.1);
    if (cRes) {
      const latestMatch = cRes.reduce((latest, item) => {
        if (item.name !== this.selectedCoinConversionName.replace("BTC", "Bitcoin")) return latest;
        const itemTime = new Date(item.timestamp).getTime();
        const latestTime = latest ? new Date(latest.timestamp).getTime() : -Infinity;
        return itemTime > latestTime ? item : latest;
      }, undefined as typeof cRes[0] | undefined);

      coinValue = latestMatch ?? { valueCAD: 0 };
    } 


    const btcValue = inputValue / (coinValue.valueCAD * (this.latestCurrencyPriceRespectToFIAT ?? 1));
    //this.convertCurrencyInput.nativeElement.value = this.formatToCanadianCurrency(fiatValue * this.latestCurrencyPriceRespectToFIAT);
    this.convertBTCInput.nativeElement.value = btcValue.toFixed(8);
    this.convertCoinInputted();
  }
  async convertCoinInputted() { 
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      const inputValue = parseFloat(this.convertBTCInput.nativeElement.value) || 1;
      let coinValue = { valueCAD: 0 };
      const cRes = await this.coinValueService.getAllCoinValuesForGraph(new Date(), 0.1);
      if (cRes) {
        const latestMatch = cRes.reduce((latest, item) => {
          if (item.name !== this.selectedCoinConversionName.replace("BTC", "Bitcoin")) return latest;
          const itemTime = new Date(item.timestamp).getTime();
          const latestTime = latest ? new Date(latest.timestamp).getTime() : -Infinity;
          return itemTime > latestTime ? item : latest;
        }, undefined as typeof cRes[0] | undefined);

        coinValue = latestMatch ?? { valueCAD: 0 }; 
      } 

      const curRate = await this.getCurrencyToCadRate(this.selectedFiatConversionName ?? "CAD");  // confirmed good
      console.log("coinValue: ", coinValue, this.selectedCoinConversionName, (this.latestCurrencyPriceRespectToCAD ?? 1), curRate, this.selectedFiatConversionName);
        
      const fiatValue = inputValue * (coinValue.valueCAD / curRate);  // confirmed good
      const selectedCurrencyValue = inputValue * coinValue.valueCAD * (this.latestCurrencyPriceRespectToCAD ?? 1);
      this.convertCurrencyInput.nativeElement.value = this.formatToCanadianCurrency(selectedCurrencyValue);
      this.convertSATInput.nativeElement.value = this.formatWithCommas(inputValue * 1e8);
      this.convertFIATInput.nativeElement.value = this.formatToCanadianCurrency(fiatValue); 
    }, 2000);
  }
  async convertCurrencyInputted() {
    const currencyValue = parseFloat(this.convertCurrencyInput.nativeElement.value.replace(/[$,]/g, '')) || 0; 
    let coinValue = { valueCAD: 0 };
    const cRes = await this.coinValueService.getAllCoinValuesForGraph(new Date(), 0.1);
    if (cRes) {
      const latestMatch = cRes.reduce((latest, item) => {
        if (item.name !== this.selectedCoinConversionName.replace("BTC", "Bitcoin")) return latest;
        const itemTime = new Date(item.timestamp).getTime();
        const latestTime = latest ? new Date(latest.timestamp).getTime() : -Infinity;
        return itemTime > latestTime ? item : latest;
      }, undefined as typeof cRes[0] | undefined);

      coinValue = latestMatch ?? { valueCAD: 0 };
    } 
    
    const btcValue = currencyValue / (coinValue.valueCAD * (this.latestCurrencyPriceRespectToCAD ?? 1)); 
    this.convertBTCInput.nativeElement.value = btcValue.toFixed(8);
    this.convertCoinInputted();
  }
  convertSatoshiInputted(): void {
    const satValue = parseInt(this.convertSATInput.nativeElement.value.replace(/,/g, ''), 10) || 0;
    const btcValue = satValue / 1e8;
    this.convertBTCInput.nativeElement.value = btcValue.toFixed(8);
    this.convertCurrencyInput.nativeElement.value = this.formatToCanadianCurrency(btcValue * this.btcToCadPrice * this.latestCurrencyPriceRespectToCAD);
    this.convertFIATInput.nativeElement.value = this.formatToCanadianCurrency(btcValue * this.btcToCadPrice * this.latestCurrencyPriceRespectToFIAT);
    this.convertSATInput.nativeElement.value = this.formatWithCommas(satValue);
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
    }).format(value);
  }
  saveNewCryptoWallet() {
    const user = this.parentRef?.user;
    if (!user?.id) return alert("You must be signed in to add a wallet.");
    const walletInfo = this.newWalletInput.nativeElement.value;

    // General Bitcoin address validation regex
    const btcAddressRegex = /^(1|3|bc1)[a-zA-Z0-9]{25,42}$/;
    if (walletInfo) {
      if (btcAddressRegex.test(walletInfo)) {
        this.parentRef?.getSessionToken().then(sessionToken => {
          this.coinValueService.updateBTCWalletAddresses(user?.id ?? 0, [walletInfo], sessionToken);
        });

      } else {
        alert('Invalid Bitcoin address. Please check for invalid characters.');
      }
    }

    this.isAddCryptoDivVisible = false;
    this.ngOnInit();
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

    const tv = await this.tradeService.getTradeConfiguration(userId, sessionToken ?? "");
    if (tv) {
      this.tradeSimParams.tradeThreshold = tv.tradeThreshold;
      this.tradeSimParams.tradePercentage = tv.valueTradePercentage;
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
    await this.coinValueService.getAllCoinValuesForGraph(new Date(), hours).then(res => {
      if (res) {
        this.allHistoricalData = res.filter((x: any) => x.name == 'Bitcoin');
        this.allHistoricalData?.forEach(x => x.valueCAD = x.valueCAD * this.latestCurrencyPriceRespectToCAD);
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
    await this.coinValueService.getAllCoinValuesForGraph(new Date(), hours).then(res => {
      if (res) {
        this.allHistoricalData = res.filter((x: any) => x.name == 'Bitcoin');
        this.allHistoricalData?.forEach(x => x.valueCAD = x.valueCAD * this.latestCurrencyPriceRespectToCAD);
      }
    });

    this.getRandomWeekOrMonthData("week");
    this.tradebotSimulationGraphData2 = this.generateTradeData(
      this.tradebotSimulationGraphData,
      this.tradeSimParams
    );

    console.log("tbsgd: ", this.tradebotSimulationGraphData, this.tradebotSimulationGraphData2);
  }
  async randomizeTradingSimGraphWithRandomMonthData() {
    const hours = 24 * 7 * 365;
    await this.coinValueService.getAllCoinValuesForGraph(new Date(), hours).then(res => {
      if (res) {
        this.allHistoricalData = res.filter((x: any) => x.name == 'Bitcoin');
        this.allHistoricalData?.forEach(x => x.valueCAD = x.valueCAD * this.latestCurrencyPriceRespectToCAD);
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
    this.tradebotSimulationGraphData = this.allHistoricalData?.filter(x => {
      if (!x.timestamp) return false;
      return x.name === 'Bitcoin' && x.timestamp.startsWith(dateString);
    }) ?? [];
    this.tradebotSimulationGraphData.forEach(x => {
      const cadToUsdRate = this.findClosestRate(x.timestamp, "usd") ?? 1;
      x.valueCAD = (x.value ?? x.valueCAD) * cadToUsdRate;
    });
    // console.log('Random day:', dateString, 'Data:', this.tradebotSimulationGraphData);
  }
  getRandomWeekOrMonthData(weekOrMonth: 'week' | 'month'): void {
    // console.log('All historical data:', this.allHistoricalData);

    // Step 1: Validate allHistoricalData
    if (!this.allHistoricalData || this.allHistoricalData.length === 0) {
      console.log('No historical data available.');
      this.tradebotSimulationGraphData = [];
      return;
    }

    // Step 2: Extract Bitcoin timestamps
    const timestamps: Date[] = this.allHistoricalData
      .filter((x: any): boolean => x.name === 'Bitcoin' && x.timestamp)
      .map((x: any): Date | null => {
        // Parse timestamp safely
        const date = new Date(x.timestamp);
        if (isNaN(date.getTime())) {
          console.warn(`Invalid timestamp: ${x.timestamp}`);
          return null;
        }
        // Normalize to start of day in UTC
        return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      })
      .filter((date: Date | null): boolean => date !== null) as Date[];

    if (timestamps.length === 0) {
      console.log('No valid Bitcoin data available.');
      this.tradebotSimulationGraphData = [];
      return;
    }

    // Step 3: Find min and max dates
    const minDate: Date = new Date(Math.min(...timestamps.map((date: Date): number => date.getTime())));
    const maxDate: Date = new Date(Math.max(...timestamps.map((date: Date): number => date.getTime())));
    const today: Date = new Date();
    today.setUTCHours(0, 0, 0, 0); // Normalize to start of day in UTC

    // Ensure maxDate doesn't exceed today
    if (maxDate > today) {
      maxDate.setTime(today.getTime());
    }

    // Helper function to format dates as YYYY-MM-DD
    const formatDate = (date: Date): string => {
      const year: number = date.getUTCFullYear();
      const month: string = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day: string = String(date.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    if (weekOrMonth === 'week') {
      // WEEK LOGIC
      // Step 4: Find the earliest Monday and latest possible Monday
      const earliestMonday: Date = new Date(minDate);
      const minDayOfWeek: number = earliestMonday.getDay();
      const daysToFirstMonday: number = minDayOfWeek === 0 ? 1 : minDayOfWeek === 1 ? 0 : 8 - minDayOfWeek;
      earliestMonday.setDate(earliestMonday.getDate() + daysToFirstMonday);
      earliestMonday.setUTCHours(0, 0, 0, 0);

      // Latest Monday must allow a full week (7 days) within maxDate
      const latestMonday: Date = new Date(maxDate);
      latestMonday.setDate(maxDate.getDate() - 6); // Ensure 7 days from Monday fit
      const latestMondayDayOfWeek: number = latestMonday.getDay();
      const daysToLatestMonday: number = latestMondayDayOfWeek === 0 ? 6 : latestMondayDayOfWeek - 1;
      latestMonday.setDate(latestMonday.getDate() - daysToLatestMonday);
      latestMonday.setUTCHours(0, 0, 0, 0);

      // Step 5: Calculate the number of possible weeks
      const millisecondsPerWeek: number = 7 * 24 * 60 * 60 * 1000;
      const weeksAvailable: number = Math.floor((latestMonday.getTime() - earliestMonday.getTime()) / millisecondsPerWeek) + 1;
      if (weeksAvailable <= 0) {
        console.log('Not enough data for a full week.');
        this.tradebotSimulationGraphData = [];
        return;
      }

      // Step 6: Select a random Monday
      const randomWeekIndex: number = Math.floor(Math.random() * weeksAvailable);
      const randomMonday: Date = new Date(earliestMonday);
      randomMonday.setDate(earliestMonday.getDate() + randomWeekIndex * 7);

      // Step 7: Define the week's date range (Monday to Sunday)
      const weekEnd: Date = new Date(randomMonday);
      weekEnd.setDate(randomMonday.getDate() + 6);

      // Generate all dates in the week
      const weekDates: string[] = [];
      for (let i = 0; i < 7; i++) {
        const currentDay: Date = new Date(randomMonday);
        currentDay.setDate(randomMonday.getDate() + i);
        weekDates.push(formatDate(currentDay));
      }

      // Step 8: Filter data for the selected week
      this.tradebotSimulationGraphData = this.allHistoricalData.filter((x: any): boolean => {
        if (!x.timestamp || x.name !== 'Bitcoin') return false;
        const date = new Date(x.timestamp);
        if (isNaN(date.getTime())) return false;
        const datePart: string = formatDate(date);
        return weekDates.includes(datePart);
      });

      console.log(`Random week: ${formatDate(randomMonday)} to ${formatDate(weekEnd)}, Data points: ${this.tradebotSimulationGraphData.length}`);
    } else {
      // MONTH LOGIC
      // Step 4: Find earliest and latest possible month starts
      const earliestMonth: Date = new Date(Date.UTC(minDate.getUTCFullYear(), minDate.getUTCMonth(), 1));
      const latestMonth: Date = new Date(Date.UTC(maxDate.getUTCFullYear(), maxDate.getUTCMonth(), 1));

      // Step 5: Calculate number of months available
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
      this.tradebotSimulationGraphData = this.allHistoricalData.filter((x: any): boolean => {
        if (!x.timestamp || x.name !== 'Bitcoin') return false;
        const date = new Date(x.timestamp);
        if (isNaN(date.getTime())) return false;
        const datePart: string = formatDate(date);
        return monthDates.includes(datePart);
      });

      console.log(`Random month: ${formatDate(randomMonthStart)} to ${formatDate(randomMonthEnd)}, Data points: ${this.tradebotSimulationGraphData.length}`);
    }
    this.tradebotSimulationGraphData.forEach(x => {
      const cadToUsdRate = this.findClosestRate(x.timestamp, "usd") ?? 1;
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

    console.log("closing menu panel");
    setTimeout(() => this.fullscreenTimeout = false, 500);
  }
  generateGeneralAiMessage() {
    this.startLoading();
    this.finishedGeneratingAiMessage = false;
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      const coinValueBTCData = this.allHistoricalData?.filter(x => x.name === "Bitcoin");
      this.generateAiMessage("1", coinValueBTCData).then(res => {
        this.finishedGeneratingAiMessage = true;
        this.hideHostAiMessage = false;
        this.stopLoading();
      });
    }, 500);
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
  async showWalletData(currency: Currency) {
    if (!currency.address) { return alert("No BTC Wallet address to look up."); }
    this.showWalletPanel();
    this.currentlySelectedCurrency = currency;

    await this.coinValueService.getWalletBalanceData(currency.address).then(res => {
      if (res) {
        this.allWalletBalanceData = res;
        this.processWalletBalances();
      }
    });
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

  showWalletPanel() {
    if (this.isWalletPanelOpen) {
      this.closeWalletPanel();
      return;
    }
    this.isWalletPanelOpen = true;
    if (this.parentRef) {
      this.parentRef.showOverlay();
    }
  }
  closeWalletPanel() {
    this.isWalletPanelOpen = false;
    this.finishedGeneratingAiWalletMessage = false;
    this.hideHostAiMessageWallet = true;
    if (this.parentRef) {
      this.parentRef.closeOverlay();
    }
  }
  async processWalletBalances() {
    if (!this.allWalletBalanceData) return;
    console.log("Processing wallet balances...", this.allWalletBalanceData);
    const additionalEntries: CoinValue[] = [];
    const currExRate = this.allHistoricalExchangeRateData && this.allHistoricalExchangeRateData[0] ? this.allHistoricalExchangeRateData[0].targetCurrency : undefined;

    for (const entry of this.allWalletBalanceData) { 
      console.log("Original CAD value:", entry.valueCAD);
      const closestRate = this.findClosestRate(entry.timestamp, this.selectedCurrency, currExRate ?? "USD") ?? 1;
      const closestBtcRate = this.findClosestBTCRate(entry.timestamp) ?? 1;

      console.log("BTC rate:", closestBtcRate);
      console.log("Currency rate:", closestRate);
      if (closestRate !== null) {
        let btcValueInSelectedCurrency = entry.valueCAD * closestBtcRate * closestRate;

        const newEntry: CoinValue = {
          id: entry.id,
          symbol: "BTC",
          name: "BTC -> $" + this.selectedCurrency,
          valueCAD: btcValueInSelectedCurrency,
          timestamp: entry.timestamp
        };

        additionalEntries.push(newEntry);
      }
    }
    this.allWalletBalanceData.push(...additionalEntries);
  }
  findClosestRate(
    timestamp: string,
    targetCurrency?: string,
    baseCurrency: string = "CAD"
  ): number | null {
    if (!this.allHistoricalExchangeRateData || this.allHistoricalExchangeRateData.length === 0) {
      return null;
    }

    const targetCurrencyToUse = (targetCurrency ?? this.selectedCurrency ?? "CAD").toLowerCase();
    const baseCurrencyToUse = baseCurrency.toLowerCase();
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
  findClosestBTCRate(timestamp: string): number | null {
    if (!this.allHistoricalData || this.allHistoricalData.length === 0) {
      return null;
    }

    //console.log("Finding closest BTC rate to: " + timestamp);
    const targetTimestamp = new Date(timestamp).getTime();

    const tmpHistoricalData = this.allHistoricalData
      .filter(x => x.name === "Bitcoin")
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (tmpHistoricalData.length === 0) {
      return null;
    }

    // Binary search for the closest timestamp
    let left = 0, right = tmpHistoricalData.length - 1;
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const midTimestamp = new Date(tmpHistoricalData[mid].timestamp).getTime();

      if (midTimestamp === targetTimestamp) {
        return tmpHistoricalData[mid].valueCAD; // Exact match found
      } else if (midTimestamp < targetTimestamp) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    // Closest rate is now at left or left - 1, compare both
    const closest = tmpHistoricalData[left];
    const previous = left > 0 ? tmpHistoricalData[left - 1] : null;

    if (!previous) return closest.valueCAD;

    return Math.abs(new Date(previous.timestamp).getTime() - targetTimestamp) <
      Math.abs(new Date(closest.timestamp).getTime() - targetTimestamp)
      ? previous.valueCAD
      : closest.valueCAD;
  }
  getAiMessage(walletAddr?: string) {
    if (!walletAddr) return "";
    return this.aiMessages.find(x => x.addr === walletAddr)?.message;
  }
  async checkBalance() {
    if (this.isTradebotBalanceShowing) {
      this.isTradebotBalanceShowing = false;
      console.log("closed trade balance ");
      return;
    } else if (this.tradebotBalances && !this.isTradebotBalanceShowing) {
      this.closeTradeDivs();
      this.isTradebotBalanceShowing = true;
      return;
    }
    if (this.tradebotBalances) {
      return;
    }
    this.closeTradeDivs();
    if (!this.tradebotBalances) {
      this.startLoading();
      this.isTradebotBalanceShowing = true;
      const sessionToken = await this.parentRef?.getSessionToken() ?? "";
      await this.tradeService.getTradeHistory(this.parentRef?.user?.id ?? 1, sessionToken).then(res => {
        if (res) {
          this.tradebotBalances = res;
        }
        this.stopLoading();
      });
    }
  }
  private closeTradeDivs() {
    this.showingTradeLogs = false;
    this.showingTradeSettings = false;
    this.isShowingTradeGraphWrapper = false;
    this.isShowingTradeValueGraph = false;
    this.isTradebotBalanceShowing = false;
    this.isShowingTradeSimulator = false;
  }

  async openTradeFullscreen() {
    this.tradeConfigLastUpdated = undefined;
    if (this.isTradePanelOpen) {
      this.closeTradeFullscreen();
    } else {
      this.isTradePanelOpen = true;
    }
  }
  closeTradeFullscreen() {
    this.closeTradeDivs();
    this.isTradePanelOpen = false;
  }
  async showTradeSettings() {
    if (!this.parentRef?.user?.id) { return alert("You must be logged in to save settings."); }
    this.startLoading();
    const tmpStatus = this.showingTradeSettings;
    this.closeTradeDivs();
    this.showingTradeSettings = !tmpStatus;
    if (this.showingTradeSettings) {
      this.getLastCoinConfigurationUpdated();
      if (!this.hasAnyTradeConfig) {
        this.setDefaultTradeConfiguration();
      } else {
        const userId = this.parentRef.user.id;
        const sessionToken = await this.parentRef.getSessionToken();
        const tv = await this.tradeService.getTradeConfiguration(userId, sessionToken);
        if (tv) {
          this.tradeMaximumTradeBalanceRatio.nativeElement.valueAsNumber = tv.maximumTradeBalanceRatio;
          this.tradeTradeThreshold.nativeElement.valueAsNumber = tv.tradeThreshold;
          this.tradeMinimumFromTradeAmount.nativeElement.valueAsNumber = tv.minimumFromTradeAmount;
          this.tradeMaximumFromTradeAmount.nativeElement.valueAsNumber = tv.maximumFromTradeAmount;
          this.tradeMaximumToTradeAmount.nativeElement.valueAsNumber = tv.maximumToTradeAmount;
          this.tradeValueTradePercentage.nativeElement.valueAsNumber = tv.valueTradePercentage;
          this.tradeFromPriceDiscrepencyStopPercentage.nativeElement.valueAsNumber = tv.fromPriceDiscrepencyStopPercentage;
          this.tradeInitialMinimumFromAmountToStart.nativeElement.valueAsNumber = tv.initialMinimumFromAmountToStart;
          this.tradeMinimumFromReserves.nativeElement.valueAsNumber = tv.minimumFromReserves;
          this.tradeMinimumToReserves.nativeElement.valueAsNumber = tv.minimumToReserves;
          this.tradeTradeMaximumTypeOccurances.nativeElement.valueAsNumber = tv.tradeTradeMaximumTypeOccurances;
          this.tradeConfigLastUpdated = tv.updated;
        }
      }
    }
    this.stopLoading();
  }
  showTradeGraphWrapper() {
    const tmpStatus = this.isShowingTradeGraphWrapper;
    this.closeTradeDivs();
    this.isShowingTradeGraphWrapper = !tmpStatus;
  }
  async showTradeValueGraph() {
    const tmpStatus = this.isShowingTradeValueGraph;
    this.closeTradeDivs();
    this.startLoading();
    this.isShowingTradeValueGraph = !tmpStatus;
    if (this.tradebotBalances?.length == 0 && this.parentRef?.user?.id) {
      const sessionToken = await this.parentRef.getSessionToken();
      await this.tradeService.getTradeHistory(this.parentRef?.user?.id ?? 1, sessionToken).then(res => {
        if (res) {
          this.tradebotBalances = res;
        }
      });
    }
    this.tradebotValuesForGraph = this.tradebotBalances?.map(balance => {
      return {
        id: balance.id,
        symbol: balance.to_currency.toUpperCase(), // or from_currency
        name: this.getFullCoinName(balance.to_currency), // optional helper function
        valueCAD: parseFloat(balance.trade_value_cad),
        timestamp: new Date(balance.timestamp).toISOString(),
      } as CoinValue;
    }).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()).slice(1);
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
    const tmpStatus = this.showingTradeLogs;
    this.closeTradeDivs();
    this.showingTradeLogs = !tmpStatus;
    this.startLoading();
    if (this.showingTradeLogs && this.tradeLogs.length == 0) {
      const sessionToken = await this.parentRef?.getSessionToken() ?? "";
      this.tradeLogs = await this.tradeService.getTradeLogs(this.parentRef?.user?.id ?? 1, sessionToken)
      this.setPaginatedLogs();
    }
    this.stopLoading();
  }
  setPaginatedLogs() {
    this.totalLogPages = Math.ceil(this.tradeLogs.length / this.logsPerPage);
    const start = (this.currentLogPage - 1) * this.logsPerPage;
    const end = start + this.logsPerPage;
    this.paginatedLogs = this.tradeLogs.slice(start, end);
  }
  nextLogPage() {
    if ((this.currentLogPage * this.logsPerPage) < this.tradeLogs.length) {
      this.currentLogPage++;
      this.setPaginatedLogs();
    }
  }
  prevLogPage() {
    if (this.currentLogPage > 1) {
      this.currentLogPage--;
      this.setPaginatedLogs();
    }
  }
  onMouseDown(event: MouseEvent) {
    this.isDragging = true;
    this.scrollContainer.nativeElement.classList.add('dragging');
    this.startX = event.pageX - this.scrollContainer.nativeElement.offsetLeft;
    this.scrollLeft = this.scrollContainer.nativeElement.scrollLeft;
    clearInterval(this.scrollInterval);
  }

  onMouseMove(event: MouseEvent) {
    if (!this.isDragging) return;
    event.preventDefault();
    const x = event.pageX - this.scrollContainer.nativeElement.offsetLeft;
    const walk = (x - this.startX) * 1; // speed factor
    this.scrollContainer.nativeElement.scrollLeft = this.scrollLeft - walk;
  }

  onMouseUp() {
    this.isDragging = false;
    this.scrollContainer.nativeElement.classList.remove('dragging');
    this.startAutoScroll();
  }

  onTouchStart(event: TouchEvent) {
    this.isDragging = true;
    this.startX = event.touches[0].pageX - this.scrollContainer.nativeElement.offsetLeft;
    this.scrollLeft = this.scrollContainer.nativeElement.scrollLeft;
    clearInterval(this.scrollInterval);
  }

  onTouchMove(event: TouchEvent) {
    if (!this.isDragging) return;
    const x = event.touches[0].pageX - this.scrollContainer.nativeElement.offsetLeft;
    const walk = (x - this.startX) * 1;
    this.scrollContainer.nativeElement.scrollLeft = this.scrollLeft - walk;
  }

  onTouchEnd() {
    this.isDragging = false;
    this.startAutoScroll();
  }
  startAutoScroll() {
    const buffer = 110; // pixels before end to trigger reset

    this.scrollInterval = setInterval(() => {
      if (!this.isDragging) {
        this.scrollContainer.nativeElement.scrollLeft += 5;
      }

      const container = this.scrollContainer.nativeElement;
      const isNearEnd =
        container.scrollLeft + container.clientWidth >= container.scrollWidth - buffer;

      if (isNearEnd) {
        clearInterval(this.scrollInterval);
        container.scrollLeft = 0;
        setTimeout(() => this.startAutoScroll(), 1000);
      }
    }, 500);
  }
  convertFromFIATToCryptoValue(currency?: any, conversionRate?: number): number { // best practice is to ensure currency.fiatRate is set.
    if (currency && (currency.fiatRate || this.btcFiatConversion) && currency.totalBalance) {
      return (conversionRate ? conversionRate : currency.fiatRate ? currency.fiatRate : this.btcFiatConversion ?? 1) * (Number)(currency.totalBalance);
    } else {
      return 0;
    }
  }
  getCurrencyDisplayValue(currencyName?: string, currency?: Currency): string {
    if (this.isDiscreete) return '***';
    if (!currency || !currency.totalBalance || !this.latestCurrencyPriceRespectToCAD) return this.formatToCanadianCurrency(0);
    const totalValue = currencyName == "BTC" ? (parseFloat(currency.totalBalance) * this.btcToCadPrice * this.latestCurrencyPriceRespectToCAD) : parseFloat(currency.totalBalance);
    return this.formatToCanadianCurrency(totalValue);
  }
  getTotalCurrencyDisplayValue(total?: Total): string {
    if (this.isDiscreete) return '***';
    if (!total || !total.totalBalance || !this.latestCurrencyPriceRespectToCAD) return this.formatToCanadianCurrency(0);
    let tmpWalletCurrency = total.currency?.toLowerCase().replaceAll("total", "").trim();
    const totalValue = tmpWalletCurrency == "btc" ? (parseFloat(total.totalBalance) * this.btcToCadPrice * this.latestCurrencyPriceRespectToCAD) : parseFloat(total.totalBalance);
    return this.formatToCanadianCurrency(totalValue);
  }
  fullscreenSelectedInPopup(event?: any) {
    this.isWalletGraphFullscreened = !this.isWalletGraphFullscreened;
  }
  async startTradeBot() {
    const user = this.parentRef?.user;
    if (!user?.id || !this.parentRef) return alert("You must be logged in.");
    if (!confirm("Are you sure you want to start the trade bot?")) {
      return this.parentRef?.showNotification("Cancelled");
    }
    let hasConfig = false;
    try {
      const sessionToken = await this.parentRef.getSessionToken();
      hasConfig = await this.tradeService.getTradeConfigurationLastUpdated(user.id, sessionToken);
      console.log(hasConfig);
    } catch {
      return alert("Server Error, Try again later.");
    }
    if (!hasConfig) return alert("You must save a bot configuration first");

    this.parentRef?.getSessionToken().then(sessionToken => {
      if (user.id) {
        this.tradeService.startBot(user.id, sessionToken).then(res => {
          if (res) {
            this.parentRef?.showNotification(res);
            if (res.includes("Trading bot has started")) {
              this.tradeBotStarted = true;
              this.tradeBotStartedSince = new Date();
            } else {
              this.tradeBotStarted = false;
            }
          }
        });
      } else { return alert("You must be logged in!"); }
    });
  }
  stopTradeBot() {
    const user = this.parentRef?.user;
    if (!user?.id) return alert("You must be logged in.");
    if (!confirm("Are you sure you want to stop the trade bot?")) {
      return this.parentRef?.showNotification("Cancelled");
    }
    this.parentRef?.getSessionToken().then(sessionToken => {
      this.tradeService.stopBot(user?.id ?? 0, sessionToken).then(res => {
        if (res) {
          this.parentRef?.showNotification(res);
          if (res.includes("Trading bot has stopped")) {
            this.tradeBotStartedSince = undefined;
            this.tradeBotStarted = false;
          } else {
            this.tradeBotStarted = true;
          }
        }
      });
    });
  }
  setDefaultTradeConfiguration() {
    if (this.tradeFromCoinSelect.nativeElement.value == "XBT" && this.tradeToCoinSelect.nativeElement.value == "USDC") {
      this.tradeMaximumTradeBalanceRatio.nativeElement.valueAsNumber = 0.9;
      this.tradeTradeThreshold.nativeElement.valueAsNumber = 0.007;
      this.tradeMinimumFromTradeAmount.nativeElement.valueAsNumber = 0.00005;
      this.tradeMaximumFromTradeAmount.nativeElement.valueAsNumber = 0.005;
      this.tradeMaximumToTradeAmount.nativeElement.valueAsNumber = 2000;
      this.tradeValueTradePercentage.nativeElement.valueAsNumber = 0.15;
      this.tradeFromPriceDiscrepencyStopPercentage.nativeElement.valueAsNumber = 0.10;
      this.tradeInitialMinimumFromAmountToStart.nativeElement.valueAsNumber = 0.001999;
      this.tradeMinimumFromReserves.nativeElement.valueAsNumber = 0.0004;
      this.tradeMinimumToReserves.nativeElement.valueAsNumber = 20;
      this.tradeTradeMaximumTypeOccurances.nativeElement.valueAsNumber = 5;
    } else {
      alert("Unrecognized trading pair");
    }
  }
  async getLastCoinConfigurationUpdated(from?: string, to?: string) {
    if (!this.parentRef?.user?.id || this.tradeConfigLastUpdated) return;
    const fromCoin = from ?? this.tradeFromCoinSelect.nativeElement.value;
    const toCoin = to ?? this.tradeToCoinSelect.nativeElement.value;
    const sessionToken = await this.parentRef.getSessionToken();
    this.hasAnyTradeConfig = false;
    this.tradeConfigLastUpdated = await this.tradeService.getTradeConfigurationLastUpdated(this.parentRef.user.id, sessionToken, fromCoin, toCoin);
    if (this.tradeConfigLastUpdated) {
      this.hasAnyTradeConfig = true;
    }
  }
  async updateCoinConfiguration() {
    if (!this.parentRef?.user?.id) {
      return alert("You must be logged in to save your configuration.");
    }

    const getVal = (el: ElementRef) => el.nativeElement?.value?.toString().trim();
    const parseNum = (val: string | null) => val !== null && val !== '' ? parseFloat(val) : null;

    const fromCoin = getVal(this.tradeFromCoinSelect);
    const toCoin = getVal(this.tradeToCoinSelect);

    if (!fromCoin) return alert("Invalid 'From' coin.");
    if (!toCoin) return alert("Invalid 'To' coin.");

    const fields = {
      MaximumFromTradeAmount: parseNum(getVal(this.tradeMaximumFromTradeAmount)),
      MinimumFromTradeAmount: parseNum(getVal(this.tradeMinimumFromTradeAmount)),
      TradeThreshold: parseNum(getVal(this.tradeTradeThreshold)),
      MaximumTradeBalanceRatio: parseNum(getVal(this.tradeMaximumTradeBalanceRatio)),
      MaximumToTradeAmount: parseNum(getVal(this.tradeMaximumToTradeAmount)),
      ValueTradePercentage: parseNum(getVal(this.tradeValueTradePercentage)),
      FromPriceDiscrepencyStopPercentage: parseNum(getVal(this.tradeFromPriceDiscrepencyStopPercentage)),
      InitialMinimumFromAmountToStart: parseNum(getVal(this.tradeInitialMinimumFromAmountToStart)),
      MinimumFromReserves: parseNum(getVal(this.tradeMinimumFromReserves)),
      MinimumToReserves: parseNum(getVal(this.tradeMinimumToReserves)),
      MaxTradeTypeOccurances: parseNum(getVal(this.tradeTradeMaximumTypeOccurances)),
    };

    const invalidField = Object.entries(fields).find(([key, val]) => val === null || isNaN(val));
    if (invalidField) {
      return alert(`Invalid value for '${invalidField[0]}'.`);
    }

    const config = {
      UserId: this.parentRef.user.id,
      FromCoin: fromCoin,
      ToCoin: toCoin,
      Updated: new Date().toISOString(),
      ...fields
    };

    const sessionToken = await this.parentRef.getSessionToken();
    this.tradeService.upsertTradeConfiguration(config, sessionToken)
      .then(result => {
        if (result) {
          this.parentRef?.showNotification(`Updated (${fromCoin}|${toCoin}) configuration: ${result}`);
          this.hasAnyTradeConfig = result;
          this.tradeConfigLastUpdated = new Date();
        } else {
          this.parentRef?.showNotification(`Error updating (${fromCoin}|${toCoin}) configuration.`);
        }
      })
      .catch(err => {
        console.error(err);
        this.parentRef?.showNotification('Failed to update configuration.');
      });
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
  async changeTimePeriodEventOnBTCHistoricalGraph(periodSelected: string) { 
    const hours = this.convertTimePeriodToHours(periodSelected); 

    // Get current time in UTC
    const currentTime = new Date();
    const startDate = new Date(currentTime.getTime() - (hours * 60 * 60 * 1000));
    console.log(`Start time for filtering (UTC):`, startDate.toISOString());

    await this.coinValueService.getAllCoinValuesForGraph(new Date(), hours).then(res => {
      if (res) {
        this.allHistoricalData = res.filter((x: any) => x.name == this.lineGraphComponent.selectedCoin);
        this.allHistoricalData?.forEach(x => {
          x.valueCAD = x.valueCAD * this.latestCurrencyPriceRespectToCAD;
          if (isNaN(x.valueCAD)) {
            console.warn(`Invalid valueCAD for BTC: ${x.valueCAD}`);
            x.valueCAD = 0;
          }
        });
        console.log(`${this.lineGraphComponent.selectedCoin} data for ${periodSelected}:`, this.allHistoricalData?.map(x => ({ timestamp: x.timestamp, valueCAD: x.valueCAD })));
      }
    });
  }
  async changeTimePeriodEventOnVolumeGraph(periodSelected: string) {
    const hours = this.convertTimePeriodToHours(periodSelected);
    await this.tradeService.getTradeVolumeForGraph(new Date(), hours).then(res => {
      if (res) {
        this.volumeData = res.map((item: any) => ({
          timestamp: item.timestamp,
          valueCAD: item.volumeBTC
        }));
        console.log(this.volumeData);
      }
    });
  }
  async changeTimePeriodEventOnCurrencyExchangeGraph(periodSelected: string) {
    const hours = this.convertTimePeriodToHours(periodSelected);

    // Clear cache when period changes
    this.exchangeRateCache.clear();

    // Get data just once
    const exchangeRates = await this.coinValueService.getAllExchangeRateValuesForGraph(new Date(), hours);
    if (!exchangeRates) return;

    // Process all data at once
    const selectCoin = this.selectedFiatConversionName;
    const selectCurrency = this.selectedCurrency;

    this.allHistoricalExchangeRateDataForGraph = exchangeRates.map((x:ExchangeRate) => {
      const rate = selectCoin === "CAD"
        ? x.rate
        : this.findClosestRate(x.timestamp, selectCoin, selectCurrency) ?? 1;
      return { ...x, rate };
    });
  }
  async fiatConvertSelectChange() {
    const selectedFiat = this.btcConvertFIATSelect.nativeElement.value;
    this.selectedFiatConversionName = selectedFiat;
    const selectedCurrency = this.selectedCurrency ?? "USD";
    if (!selectedFiat) return;

    try {
      // Get current BTC amount
      const btcAmount = parseFloat(this.convertBTCInput.nativeElement.value) || 0;

      // Get BTC to USD rate
      const btcToCADRate = await this.getBtcToCADRate(selectedCurrency);

      // Get USD to selected fiat (CAD) rate
      const usdToFiatRate = await this.getCurrencyToFiatRate(selectedFiat, selectedCurrency);

      // Calculate USD value
      const usdValue = btcAmount * btcToCADRate;

      // Calculate CAD value
      const cadValue = usdValue * usdToFiatRate;

      // Update fields
      this.convertCurrencyInput.nativeElement.value = this.formatToCanadianCurrency(usdValue);
      this.convertFIATInput.nativeElement.value = this.formatToCanadianCurrency(cadValue);

      // Update SAT value
      this.convertSATInput.nativeElement.value = this.formatWithCommas(btcAmount * 1e8);

    } catch (error) {
      console.error('Error updating fiat rate:', error);
    }
  }

  async getBtcToCADRate(currency: string): Promise<number> {
    const rate = await this.coinValueService.getLatestCoinValuesByName('Bitcoin');
    return rate?.valueCAD || 1; // Adjust based on your actual rate property
  }

  async getCurrencyConversionRate(baseCurrency: string, targetCurrency: string): Promise<number> {
    // If same currency, return 1
    if (baseCurrency === targetCurrency) {
      return 1;
    }

    try {
      // Get base currency to CAD rate
      const baseToCadRate = await this.getCurrencyToCadRate(baseCurrency);

      // Get target currency to CAD rate
      const targetToCadRate = await this.getCurrencyToCadRate(targetCurrency);

      // Calculate conversion rate: (1 unit of baseCurrency in CAD) / (1 unit of targetCurrency in CAD)
      return baseToCadRate / targetToCadRate;
    } catch (error) {
      console.error('Error getting conversion rate:', error);
      return 1; // Fallback to 1:1 if there's an error
    }
  }

  private async getCurrencyToCadRate(currency: string): Promise<number> {
    console.log("Getting currency to CAD rate for:", currency);
    if (currency === 'CAD') {
      return 1;
    }

    // Check if it's a cryptocurrency
    const crypto = await this.coinValueService.getLatestCoinValuesByName(currency);
    if (crypto && crypto.name) {
      console.log("Crypto rate found:", crypto);
      return crypto.valueCAD || 1;
    }

    // Handle fiat currencies
    const exchangeRate = await this.coinValueService.getLatestCurrencyValuesByName(currency);
    if (exchangeRate) {
      // If the rate is CAD → target, we need to invert it
      if (exchangeRate.baseCurrency === 'CAD') {
        return 1 / exchangeRate.rate;
      }
      // If it's target → CAD, use directly
      return exchangeRate.rate;
    }

    return 1; // Fallback rate
  }
  private async getCurrencyToFiatRate(targetFiat: string, baseCurrency: string = this.selectedCurrency ?? ""): Promise<number> {
    if (!this.selectedCurrency) return 1;
    targetFiat = targetFiat.replace("BTC", "Bitcoin");

    // If converting to same currency, rate is 1
    if (targetFiat === this.selectedCurrency) return 1;


    // Fallback: Get CAD→TargetFiat rate and calculate via CAD
    const cadToTarget = await this.coinValueService.getLatestCurrencyValuesByName(targetFiat);
    if (cadToTarget) {
      console.log("cadToTarget", cadToTarget);
      return cadToTarget.rate / this.latestCurrencyPriceRespectToCAD;
    }

    return 1;
  }
  async coinConvertSelectChange() {
    // Get the selected coin from the dropdown
    let selectedCoin = this.btcConvertCoinSelect.nativeElement.value;
    this.selectedCoinConversionName = selectedCoin;
    if (!selectedCoin) return;
    selectedCoin = selectedCoin.replace("BTC", "Bitcoin");
    // Get the current amount entered in the BTC/coin input field
    const coinAmount = parseFloat(this.convertBTCInput.nativeElement.value) || 0;
    
    try {
      // Get the latest price for the selected coin
      const coinData = await this.coinValueService.getLatestCoinValuesByName(selectedCoin);
      if (!coinData || !coinData.valueCAD) return;

      // Calculate values for all fields
      const currentSelectedCurrencyValue = coinAmount * coinData.valueCAD;
      const satValue = selectedCoin === 'BTC' ? coinAmount * 1e8 :
        (coinAmount * coinData.valueCAD) / (this.btcToCadPrice * 1e8);

      // Get current fiat rate if fiat is selected
      let fiatValue = currentSelectedCurrencyValue;
      const selectedFiat = this.btcConvertFIATSelect.nativeElement.value;
      if (selectedFiat) {
        const fiatRate = await this.coinValueService.getLatestCurrencyValuesByName(selectedFiat);
        if (fiatRate) {
          fiatValue = currentSelectedCurrencyValue * fiatRate.rate;
        }
      }
      const periodHours = this.convertTimePeriodToHours(this.lineGraphComponent.selectedPeriod);
      this.coinValueService.getAllCoinValuesForGraph(new Date(), periodHours).then(res => { 
        this.allHistoricalData = res?.filter(x => x.name == selectedCoin) ?? []; 
        this.allHistoricalData?.forEach(x => x.valueCAD = x.valueCAD * this.latestCurrencyPriceRespectToCAD); 
        this.tradebotTradeValuesForMainGraph = [];
        this.lineGraphComponent.data2 = []; 
         this.lineGraphComponent.selectedCoin = selectedCoin;  
      });

      // Update all fields
      this.convertCurrencyInput.nativeElement.value = this.formatToCanadianCurrency(currentSelectedCurrencyValue * (this.latestCurrencyPriceRespectToCAD ?? 1));
      this.convertSATInput.nativeElement.value = this.formatWithCommas(satValue);
      this.convertFIATInput.nativeElement.value = this.formatToCanadianCurrency(fiatValue);

      // Store the conversion rate for this coin
      this.latestCurrencyPriceRespectToFIAT = coinData.valueCAD;

    } catch (error) {
      console.error('Error in coin conversion:', error);
    }
  }
  convertTimePeriodToHours(period: string): number {
    const periodRegex = /^(\d+)\s*(m|min|mins|minute|minutes|h|hour|hours|d|day|days|w|week|weeks|m|month|months|y|year|years)$/;
    const match = period.trim().toLowerCase().match(periodRegex);

    if (match) {
      const value = parseInt(match[1], 10);
      const unit = match[2];

      switch (unit) {
        case 'min':
        case 'mins':
        case 'minute':
        case 'minutes':
          return value / 60; // Minutes to hours
        case 'h':
        case 'hour':
        case 'hours':
          return value; // Hours
        case 'd':
        case 'day':
        case 'days':
          return value * 24;
        case 'w':
        case 'week':
        case 'weeks':
          return value * 24 * 7;
        case 'm':
        case 'month':
        case 'months':
          return value * 24 * 30;
        case 'y':
        case 'year':
        case 'years':
          return value * 24 * 365;
        default:
          console.warn(`Unknown period unit: ${unit}`);
          return 1;
      }
    }
    console.warn(`Invalid period format: ${period}`);
    return 1;
  }
  getLastTradePercentage() {
    if (this.tradebotBalances && this.cadToUsdRate && this.btcUSDRate) {
      const price = parseFloat(this.tradebotBalances[0].btc_price_usdc);
      const rate = this.btcUSDRate ?? 1;
      return ((rate - price) / price) * 100;
    }
    return 0;
  }
  getLastTradebotTradeDisplay() {
    if (this.tradebotBalances && this.cadToUsdRate) {
      const value = this.tradebotBalances[0].value;
      const price = parseFloat(this.tradebotBalances[0].btc_price_usdc); 
      const buyOrSell = this.tradebotBalances[0].to_currency == "XBT" ? "Buy" : "Sell";
      const timestamp = this.getUtcTimeSince(this.tradebotBalances[0].timestamp);
      const vp = parseFloat(value) * price; 
      return `[${timestamp}] ${buyOrSell}:${value}(${this.formatToCanadianCurrency(vp)}) @ ${this.formatToCanadianCurrency(price)} `;
    }
    return '';
  }
}
