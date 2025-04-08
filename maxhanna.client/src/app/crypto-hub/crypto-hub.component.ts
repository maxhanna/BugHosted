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

@Component({
  selector: 'app-crypto-hub',
  templateUrl: './crypto-hub.component.html',
  styleUrl: './crypto-hub.component.css',
  standalone: false
})
export class CryptoHubComponent extends ChildComponent implements OnInit, OnDestroy {
  wallet?: MiningWalletResponse | undefined;
  btcFiatConversion?: number = 0;
  currentSelectedCoin: string = 'Bitcoin';
  selectedCurrency = "CAD";
  noMining = false;
  isDiscreete = false;

  data?: CoinValue[];
  allHistoricalData?: CoinValue[] = [];
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

  aiMessages: { addr: string, message: string }[] = [];
  hideHostAiMessageWallet = false;
  hideHostAiMessage = false;

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
    timestamp: Date
  }[] = [];

  @ViewChild(LineGraphComponent) lineGraphComponent!: LineGraphComponent;
  @ViewChild('btcConvertSATValue') btcConvertSATValue!: ElementRef<HTMLInputElement>;
  @ViewChild('btcConvertCADValue') btcConvertCADValue!: ElementRef<HTMLInputElement>;
  @ViewChild('btcConvertBTCValue') btcConvertBTCValue!: ElementRef<HTMLInputElement>;
  @ViewChild('selectedCurrencyDropdown') selectedCurrencyDropdown!: ElementRef<HTMLSelectElement>;
  @ViewChild('newWalletInput') newWalletInput!: ElementRef<HTMLInputElement>;
  @ViewChild('miningRigComponent') miningRigComponent!: MiningRigsComponent;

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
      await this.getBTCWallets();

      await this.coinValueService.getLatestCoinValues().then(res => {
        this.data = res;
      });

      await this.coinValueService.getAllExchangeRateValuesForGraph().then(res => {
        if (res) {
          this.allHistoricalExchangeRateData = res;
        }
      });
      await this.coinValueService.getLatestCoinValuesByName("Bitcoin").then(res => {
        if (res) {
          this.btcToCadPrice = res.valueCAD;
          if (!this.btcFiatConversion) {
            this.btcFiatConversion = res.valueCAD;
          }
          console.log(res);
        }
      });
      await this.coinValueService.getUniqueCurrencyNames().then(res => { this.uniqueCurrencyNames = res; })
      await this.getUserCurrency();
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

      const coinValueBTCData = this.allHistoricalData?.filter(x => x.name === "Bitcoin");
      this.generateAiMessage("1", coinValueBTCData).then(res => { this.finishedGeneratingAiMessage = true; });
    } catch (error) {
      console.error('Error fetching coin values:', error);
    }
    this.convertBTCtoFIAT()
    this.stopLoading();
    setTimeout(() => {
      this.scrollContainer.nativeElement.scrollLeft = Math.random() * (this.scrollContainer.nativeElement.scrollWidth - this.scrollContainer.nativeElement.clientWidth);
    }, 10);
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
  private async getBTCWallets() { 
    this.wallet = this.wallet || { currencies: [] };
    const user = this.parentRef?.user;
    if (user?.id) {
      await this.coinValueService.getBTCWallet(user.id).then(res => {
        if (res && res.currencies) {
          res.currencies.forEach((btcData: Currency) => {
            const tmpCurrency = {
              currency: btcData.currency,
              totalBalance: btcData.totalBalance,
              available: btcData.available,
              fiatRate: btcData.fiatRate ?? this.btcFiatConversion,
              address: btcData.address
            } as Currency;
            this.wallet?.currencies?.push(tmpCurrency);
          });
        }
      });
    }

    if (this.wallet?.currencies) {
      this.wallet.total = {
        currency: "Total BTC",
        totalBalance: this.wallet.currencies
          .filter(x => x.currency?.toUpperCase() === "BTC")
          .reduce((sum, curr) => sum + Number(curr.totalBalance || 0), 0)
          .toString(),
        available: this.wallet.currencies
          .filter(x => x.currency?.toUpperCase() === "BTC")
          .reduce((sum, curr) => sum + Number(curr.available || 0), 0)
          .toString(),
      };
      this.wallet.currencies.forEach(x => !x.address ? x.address = "Nicehash Wallet" : x.address);
    }
  } 
  calculateTotalValue(currency: Currency): number {
    if (currency && (currency.fiatRate || this.btcFiatConversion) && currency.totalBalance) {
      return (currency.fiatRate ? currency.fiatRate : this.btcFiatConversion ?? 1) * (Number)(currency.totalBalance);
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
        this.coinValueService.updateBTCWalletAddresses(user.id, [walletInfo]);
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
    else return cadValue * (this.latestCurrencyPriceRespectToCAD ?? 1);
  }
  getConvertedCurrencyValueByString(cadValue?: string) {
    if (!cadValue) return 0;
    else return parseInt(cadValue) * (this.latestCurrencyPriceRespectToCAD ?? 1);
  }
  discreete() {
    this.isDiscreete = !this.isDiscreete;
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
    this.isMenuPanelOpen = false;
    if (this.parentRef) {
      this.parentRef.closeOverlay();
    }
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
    this.finishedGeneratingAiWalletMessage = false;
    await this.generateAiMessage(currency.address, this.allWalletBalanceData).then(res => { this.finishedGeneratingAiWalletMessage = true; });
  }

  private async generateAiMessage(walletAddress: string, data: any) {
    const tgtMessage = this.aiMessages.find(x => x.addr === walletAddress);
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

      await this.aiService.sendMessage(new User(0), true, message, 600).then(res => {
        if (res && res.response) {
          this.aiMessages.push({ addr: walletAddress ?? "1", message: this.aiService.parseMessage(res.response) });
        }
      });
    }
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
  checkBalance() {
    this.isTradebotBalanceShowing = true;
    this.tradeService.GetWalletBalance('').then(res => {
      if (res) {
        this.tradebotBalances = res; 
      }
    });
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
    // Scroll by a small amount every second
    this.scrollInterval = setInterval(() => {
      if (!this.isDragging) {
        this.scrollContainer.nativeElement.scrollLeft += 5; // Scroll right by 1px
      }
      const isAtEnd = this.scrollContainer.nativeElement.scrollLeft + this.scrollContainer.nativeElement.clientWidth >= this.scrollContainer.nativeElement.scrollWidth;

      if (isAtEnd) {
        this.scrollContainer.nativeElement.scrollLeft = 0;
      }
    }, 500); // every 0.5 seconds
  }
}
