import { Component, ElementRef, EventEmitter, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { MiningService } from '../../services/mining.service';
import { Currency, MiningWalletResponse, Total } from '../../services/datacontracts/crypto/mining-wallet-response';
import { CoinValue } from '../../services/datacontracts/crypto/coin-value';
import { ExchangeRate } from '../../services/datacontracts/crypto/exchange-rate';
import { LineGraphComponent } from '../line-graph/line-graph.component';
import { CoinValueService } from '../../services/coin-value.service';
import { UserService } from '../../services/user.service';
import { MiningRigsComponent } from '../mining-rigs/mining-rigs.component';
import { AiService } from '../../services/ai.service';
import { User } from '../../services/datacontracts/user/user';
import { TradeService } from '../../services/trade.service';
import { debounce } from 'rxjs';

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
  selectedCurrency = "CAD";
  noMining = false;
  isDiscreete = false;

  data?: CoinValue[];
  allHistoricalData?: CoinValue[] = [];
  volumeData?: any[] = undefined;
  allHistoricalDataPreCalculation?: CoinValue[] = [];
  allWalletBalanceData?: CoinValue[] = [];
  allHistoricalExchangeRateData?: ExchangeRate[] = [];
  btcWalletResponse?: MiningWalletResponse = undefined;
  btcToCadPrice = 0;
  isAddCryptoDivVisible = false;
  areWalletAddressesHidden = true;
  isMenuPanelOpen = false;
  isWalletPanelOpen = false;
  latestCurrencyPriceRespectToCAD = 0;
  uniqueCurrencyNames: string[] = [];
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
  gotTradebotBalances = false;
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

  @ViewChild('scrollContainer', { static: true }) scrollContainer!: ElementRef;

  isDragging = false;
  startX = 0;
  scrollLeft = 0;
  scrollInterval: any;
  isTradebotBalanceShowing = false;
  tradebotBalances: {
    id: number,
    user_id: number,
    from_currency: string,
    to_currency: string,
    value: string,
    btc_price_cad: string,
    trade_value_cad: string,
    timestamp: Date
  }[] = [];
  tradebotValuesForGraph: any;

  @ViewChild(LineGraphComponent) lineGraphComponent!: LineGraphComponent;
  @ViewChild('miningRigComponent') miningRigComponent!: MiningRigsComponent;
  @ViewChild('btcConvertSATValue') btcConvertSATValue!: ElementRef<HTMLInputElement>;
  @ViewChild('btcConvertCADValue') btcConvertCADValue!: ElementRef<HTMLInputElement>;
  @ViewChild('btcConvertBTCValue') btcConvertBTCValue!: ElementRef<HTMLInputElement>;
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

  @Output() coinSelected = new EventEmitter<string>();

  constructor(private miningService: MiningService,
    private coinValueService: CoinValueService,
    private userService: UserService,
    private aiService: AiService,
    private tradeService: TradeService) {
    super();
  }
  async ngOnInit() {
    this.startAutoScroll();
    this.startLoading();
    try {
      this.parentRef?.addResizeListener();
      await this.coinValueService.getLatestCoinValuesByName("Bitcoin").then(res => { if (res && res.valueCAD) this.btcFiatConversion = res.valueCAD; });
      this.getBTCWallets();
      this.getIsTradebotStarted();
      this.coinValueService.getLatestCoinValues().then(res => {
        this.data = res;
      });

      this.coinValueService.getAllExchangeRateValuesForGraph().then(res => {
        if (res) {
          this.allHistoricalExchangeRateData = res;
        }
      });
      this.coinValueService.getLatestCoinValuesByName("Bitcoin").then(res => {
        if (res) {
          this.btcToCadPrice = res.valueCAD;
          if (!this.btcFiatConversion) {
            this.btcFiatConversion = res.valueCAD;
          }
        }
      });
      this.coinValueService.getUniqueCurrencyNames().then(res => { this.uniqueCurrencyNames = res; })
      this.getUserCurrency();
      const ceRes = await this.coinValueService.getLatestCurrencyValuesByName(this.selectedCurrency) as ExchangeRate;
      if (ceRes) {
        this.latestCurrencyPriceRespectToCAD = ceRes.rate;
      }
      await this.coinValueService.getAllCoinValuesForGraph().then(res => {
        if (res) {
          this.allHistoricalDataPreCalculation = res;
          this.allHistoricalData = res;
          this.allHistoricalData?.forEach(x => x.valueCAD = x.valueCAD * this.latestCurrencyPriceRespectToCAD);
        }
      });
      await this.tradeService.getTradeVolume().then(res => {
        this.volumeData = res;
        this.volumeData = res.map((item: any) => ({
          timestamp: item.timestamp,
          valueCAD: item.volumeBTC
        }));
      });
      setTimeout(() => {
        if (this.parentRef?.user?.id) {
          this.tradeService.hasApiKey(this.parentRef.user.id).then(res => { this.hasKrakenApi = res; });
          this.getLastCoinConfigurationUpdated("", "");

        }
      });
    } catch (error) {
      console.error('Error fetching coin values:', error);
    }
    this.convertBTCtoFIAT()
    this.stopLoading();
  }
  private async getUserCurrency() {
    const user = this.parentRef?.user;
    if (user?.id) {
      await this.coinValueService.getUserCurrency(user.id).then(async (res) => {
        if (res) {
          if (res.includes("not found")) {
            this.selectedCurrency = "CAD";
          } else {
            this.selectedCurrency = res;
          }
        }
      });
    } else {
      this.selectedCurrency = "CAD";
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
  }
  convertFromFIATToCryptoValue(currency?: any, conversionRate?: number): number { // best practice is to ensure currency.fiatRate is set.
    if (currency && (currency.fiatRate || this.btcFiatConversion) && currency.totalBalance) {
      return (conversionRate ? conversionRate : currency.fiatRate ? currency.fiatRate : this.btcFiatConversion ?? 1) * (Number)(currency.totalBalance);
    } else {
      return 0;
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
  selectCoin(coinName?: string) {
    if (!coinName) return;
    this.coinSelected.emit(this.currentSelectedCoin = coinName === "Total BTC" || coinName === "BTC" ? "Bitcoin" : coinName);
  }
  convertBTCtoFIAT(): void {
    const btcValue = parseFloat(this.btcConvertBTCValue.nativeElement.value) || 0;
    const cadValue = btcValue * this.btcToCadPrice * (this.latestCurrencyPriceRespectToCAD ?? 1);

    this.btcConvertCADValue.nativeElement.value = this.formatToCanadianCurrency(cadValue);
    this.btcConvertSATValue.nativeElement.value = this.formatWithCommas(btcValue * 1e8);
  }

  convertCurrencyToBTC(): void {
    const currencyValue = parseFloat(this.btcConvertCADValue.nativeElement.value.replace(/[$,]/g, '')) || 0;
    const sanitizedValue = parseFloat(currencyValue.toString().replace(/[$,]/g, '')) || 0;
    const btcValue = sanitizedValue / (this.btcToCadPrice * (this.latestCurrencyPriceRespectToCAD ?? 1));

    this.btcConvertBTCValue.nativeElement.value = btcValue.toFixed(8);
    this.btcConvertSATValue.nativeElement.value = this.formatWithCommas(btcValue * 1e8);
    this.btcConvertCADValue.nativeElement.value = this.formatToCanadianCurrency(sanitizedValue);
  }

  convertCADtoBTC(): void {
    const currencyValue = parseFloat(this.btcConvertCADValue.nativeElement.value.replace(/[$,]/g, '')) || 0;
    const btcValue = currencyValue / (this.btcToCadPrice * (this.btcFiatConversion ?? 1));

    this.btcConvertBTCValue.nativeElement.value = btcValue.toFixed(8);
    this.btcConvertSATValue.nativeElement.value = this.formatWithCommas(btcValue * 1e8);
    this.btcConvertCADValue.nativeElement.value = this.formatToCanadianCurrency(currencyValue);
  }

  convertSatoshiToBTC(): void {
    const satValue = parseInt(this.btcConvertSATValue.nativeElement.value.replace(/,/g, ''), 10) || 0;
    const btcValue = satValue / 1e8;

    this.btcConvertBTCValue.nativeElement.value = btcValue.toFixed(8);
    this.btcConvertCADValue.nativeElement.value = this.formatToCanadianCurrency(btcValue * this.btcToCadPrice * this.latestCurrencyPriceRespectToCAD);
    this.btcConvertSATValue.nativeElement.value = this.formatWithCommas(satValue);
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
    const selectedCoin = this.selectedCurrencyDropdown.nativeElement.value;
    this.selectedCurrency = selectedCoin;
    if (selectedCoin && user) {
      await this.coinValueService.updateUserCurrency(user, selectedCoin);
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
          this.aiMessages.push({ addr: walletAddress ?? "1", message:  response}); 
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
  processWalletBalances() {
    if (!this.allWalletBalanceData) return;

    const additionalEntries: CoinValue[] = [];

    for (const entry of this.allWalletBalanceData) {
      const closestRate = this.findClosestRate(entry.timestamp) ?? 1;
      const closestBtcRate = this.findClosestBTCRate(entry.timestamp) ?? 1;
      if (closestRate !== null) {
        let btcValueInCad = (entry.valueCAD * (closestBtcRate * closestRate)) / 100_000_000;

        const newEntry: CoinValue = {
          id: entry.id,
          symbol: "BTC",
          name: "BTC -> " + this.selectedCurrency,
          valueCAD: btcValueInCad,
          timestamp: entry.timestamp
        };

        additionalEntries.push(newEntry);
      }
    }
    this.allWalletBalanceData.push(...additionalEntries);
  }
  findClosestRate(timestamp: string): number | null {
    if (!this.allHistoricalExchangeRateData || this.allHistoricalExchangeRateData.length === 0) {
      return null;
    }

    const targetTimestamp = new Date(timestamp).getTime();
    const tmpHistoricalData = this.allHistoricalExchangeRateData
      .filter(x => x.targetCurrency == this.selectedCurrency)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Binary search for closest rate
    let left = 0, right = tmpHistoricalData.length - 1;
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const midTimestamp = new Date(tmpHistoricalData[mid].timestamp).getTime();

      if (midTimestamp === targetTimestamp) {
        return tmpHistoricalData[mid].rate; // Exact match
      } else if (midTimestamp < targetTimestamp) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    // Closest rate is now at left or left - 1, compare both
    const closest = tmpHistoricalData[left];
    const previous = left > 0 ? tmpHistoricalData[left - 1] : null;

    if (!previous) return closest.rate;

    return Math.abs(new Date(previous.timestamp).getTime() - targetTimestamp) <
      Math.abs(new Date(closest.timestamp).getTime() - targetTimestamp)
      ? previous.rate
      : closest.rate;
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
    } else if (this.gotTradebotBalances && !this.isTradebotBalanceShowing) {
      this.closeTradeDivs();
      this.isTradebotBalanceShowing = true; 
      return;
    }
    if (this.gotTradebotBalances) {
      return;
    }
    this.closeTradeDivs();
    if (!this.gotTradebotBalances) {
      this.startLoading();
      this.isTradebotBalanceShowing = true;
      const sessionToken = await this.parentRef?.getSessionToken() ?? "";
      await this.tradeService.getTradeHistory(this.parentRef?.user?.id ?? 1, sessionToken).then(res => {
        if (res) {
          this.tradebotBalances = res;
          this.gotTradebotBalances = true;
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
  }

  openTradeFullscreen() {
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
  showTradeSettings() {
    const tmpStatus = this.showingTradeSettings;
    this.closeTradeDivs();
    this.showingTradeSettings = !tmpStatus;
    if (this.showingTradeSettings) {
      setTimeout(() => {
        this.setDefaultTradeConfiguration();
        this.getLastCoinConfigurationUpdated();
      }, 10);
    }
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
    if (this.tradebotBalances.length == 0 && this.parentRef?.user?.id) {
      const sessionToken = await this.parentRef.getSessionToken();
      await this.tradeService.getTradeHistory(this.parentRef?.user?.id ?? 1, sessionToken).then(res => {
        if (res) {
          this.tradebotBalances = res;
          this.gotTradebotBalances = true;
        }
      });
    }
    this.tradebotValuesForGraph = this.tradebotBalances.map(balance => {
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
    if (!this.parentRef?.user?.id) return alert("You must be logged in to view trade logs."); 
    const tmpStatus = this.showingTradeLogs;
    this.closeTradeDivs();
    this.showingTradeLogs = !tmpStatus;
    if (this.showingTradeLogs && this.tradeLogs.length == 0) {
      const sessionToken = await this.parentRef.getSessionToken();
      this.tradeLogs = await this.tradeService.getTradeLogs(this.parentRef.user.id, sessionToken);
      this.setPaginatedLogs();
    }
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

  getCurrencyDisplayValue(currencyName?: string, currency?: Currency): string {
    if (this.isDiscreete || !currencyName || !currency) return '***';
    let tmpWalletCurrency = currencyName.toLowerCase().replaceAll("total", "").trim();
    currency.fiatRate = tmpWalletCurrency == "btc" ? this.btcFiatConversion : 1;
    const totalValue = this.convertFromFIATToCryptoValue(currency);

    return this.formatToCanadianCurrency(totalValue);

  }
  getTotalCurrencyDisplayValue(total?: Total): string {
    if (this.isDiscreete || !total || !this.btcFiatConversion) return '***';
    let tmpWalletCurrency = total.currency?.toLowerCase().replaceAll("total", "").trim();
    const totalValue = this.convertFromFIATToCryptoValue(total, tmpWalletCurrency != 'btc' ? 1 : undefined);
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
      this.tradeService.startBot(user?.id ?? 0, sessionToken).then(res => {
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
}
