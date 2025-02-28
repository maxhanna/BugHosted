import { Component, ElementRef, EventEmitter, OnInit, Output, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { MiningService } from '../../services/mining.service';
import { Currency, MiningWalletResponse, Total } from '../../services/datacontracts/crypto/mining-wallet-response';
import { CoinValue } from '../../services/datacontracts/crypto/coin-value';
import { ExchangeRate } from '../../services/datacontracts/crypto/exchange-rate';
import { LineGraphComponent } from '../line-graph/line-graph.component';
import { CoinValueService } from '../../services/coin-value.service';
import { UserService } from '../../services/user.service';
import { MiningRigsComponent } from '../mining-rigs/mining-rigs.component';

@Component({
  selector: 'app-crypto-hub',
  templateUrl: './crypto-hub.component.html',
  styleUrl: './crypto-hub.component.css'
})
export class CryptoHubComponent extends ChildComponent implements OnInit {
  wallet?: MiningWalletResponse | undefined;
  btcFiatConversion?: number = 0;
  currentSelectedCoin: string = 'Bitcoin';
  selectedCurrency = "CAD";
  noMining = false;
  isDiscreete = false;

  data?: CoinValue[]; 
  allHistoricalData?: CoinValue[] = [];
  allHistoricalExchangeRateData?: ExchangeRate[] = [];
  btcWalletResponse?: MiningWalletResponse = undefined;
  btcToCadPrice = 0;
  isAddCryptoDivVisible = false;
  areWalletAddressesHidden = true;
  isMenuPanelOpen = false;
  latestCurrencyPriceRespectToCAD = 0;
  uniqueCurrencyNames: string[] = []; 

  @ViewChild(LineGraphComponent) lineGraphComponent!: LineGraphComponent;
  @ViewChild('btcConvertSATValue') btcConvertSATValue!: ElementRef<HTMLInputElement>;
  @ViewChild('btcConvertCADValue') btcConvertCADValue!: ElementRef<HTMLInputElement>;
  @ViewChild('btcConvertBTCValue') btcConvertBTCValue!: ElementRef<HTMLInputElement>;
  @ViewChild('selectedCurrencyDropdown') selectedCurrencyDropdown!: ElementRef<HTMLSelectElement>;
  @ViewChild('newWalletInput') newWalletInput!: ElementRef<HTMLInputElement>;
  @ViewChild('miningRigComponent') miningRigComponent!: MiningRigsComponent;

  @Output() coinSelected = new EventEmitter<string>();

  constructor(private miningService: MiningService, private coinValueService: CoinValueService, private userService: UserService) {
    super();
  }
  async ngOnInit() {
    this.startLoading(); 
    try {
      await this.getBTCWallets();
      
      await this.coinValueService.getLatestCoinValues().then(res => {
        this.data = res;
      });

      await this.coinValueService.getAllExchangeRateValues().then(res => {
        if (res) {
          this.allHistoricalExchangeRateData = res;
        }
      });
      await this.coinValueService.getLatestCoinValuesByName("Bitcoin").then(res => {
        if (res) {
          this.btcToCadPrice = res.valueCAD;
        }
      });
      await this.coinValueService.getUniqueCurrencyNames().then(res => { this.uniqueCurrencyNames = res; })
      if (this.parentRef?.user) {
        await this.coinValueService.getUserCurrency(this.parentRef?.user).then(async res => {
          if (res) {
            if (res.includes("not found")) { 
              this.selectedCurrency = "CAD";
            } else { 
              this.selectedCurrency = res;
            }
            const ceRes = await this.coinValueService.getLatestCurrencyValuesByName(this.selectedCurrency) as ExchangeRate;
            if (ceRes) {
              this.latestCurrencyPriceRespectToCAD = ceRes.rate; 
            }
          }
        });
      }
      await this.coinValueService.getAllCoinValues().then(res => {
        if (res) { 
          this.allHistoricalData = res;
          this.allHistoricalData?.forEach(x => x.valueCAD = x.valueCAD * this.latestCurrencyPriceRespectToCAD);
        }
      });
    } catch (error) {
      console.error('Error fetching coin values:', error);
    }
    this.convertBTCtoFIAT()
    this.stopLoading();
  }

  private async getBTCWallets() {
    this.wallet = await this.getNicehashWallets(); 
    this.wallet = this.wallet || { currencies: [] }; 

    if (this.parentRef?.user) {
      await this.userService.getBTCWallet(this.parentRef.user).then(res => {
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

  private async getNicehashWallets() {
    const res = await this.miningService.getMiningWallet(this.parentRef?.user!) as MiningWalletResponse;
    if (res) {
      this.btcFiatConversion = res.currencies!.find(x => x.currency?.toUpperCase() == "BTC")?.fiatRate; 
    }
    return res;
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
    const walletInfo = this.newWalletInput.nativeElement.value;
    if (walletInfo && this.parentRef?.user) {
      this.userService.updateBTCWalletAddresses(this.parentRef.user, [walletInfo]);
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
    if (this.parentRef && this.parentRef.isShowingOverlay) {
      this.parentRef.isShowingOverlay = false;
    }
  }
}
