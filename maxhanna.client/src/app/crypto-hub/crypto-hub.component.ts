import { Component, ElementRef, EventEmitter, OnInit, Output, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { MiningService } from '../../services/mining.service';
import { Currency, MiningWalletResponse, Total } from '../../services/datacontracts/crypto/mining-wallet-response';
import { CoinValue } from '../../services/datacontracts/crypto/coin-value';
import { LineGraphComponent } from '../line-graph/line-graph.component';
import { CoinValueService } from '../../services/coin-value.service';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-crypto-hub',
  templateUrl: './crypto-hub.component.html',
  styleUrl: './crypto-hub.component.css'
})
export class CryptoHubComponent extends ChildComponent implements OnInit {
  wallet?: MiningWalletResponse | undefined;
  btcFiatConversion?: number = 0;
  currentSelectedCoin: string = 'Bitcoin';
  noMining = false;

  data?: CoinValue[]; 
  allHistoricalData?: CoinValue[] = [];
  btcWalletResponse?: MiningWalletResponse = undefined;
  btcToCadPrice = 0;
  isAddCryptoDivVisible = false;
  areWalletAddressesHidden = true;

  @ViewChild(LineGraphComponent) lineGraphComponent!: LineGraphComponent;
  @ViewChild('btcConvertSATValue') btcConvertSATValue!: ElementRef<HTMLInputElement>;
  @ViewChild('btcConvertCADValue') btcConvertCADValue!: ElementRef<HTMLInputElement>;
  @ViewChild('btcConvertBTCValue') btcConvertBTCValue!: ElementRef<HTMLInputElement>;
  @ViewChild('newWalletInput') newWalletInput!: ElementRef<HTMLInputElement>;

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
      await this.coinValueService.getAllCoinValues().then(res => {
        if (res) {
          this.allHistoricalData = res;
        }
      });
      await this.coinValueService.getLatestCoinValuesByName("Bitcoin").then(res => {
        if (res) {
          this.btcToCadPrice = res.valueCAD;
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
        if (res) {
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
    const cadValue = btcValue * this.btcToCadPrice;

    this.btcConvertCADValue.nativeElement.value = this.formatToCanadianCurrency(cadValue);
    this.btcConvertSATValue.nativeElement.value = this.formatWithCommas(btcValue * 1e8); // 1 BTC = 100,000,000 Satoshi

    console.log(this.btcConvertBTCValue.nativeElement.value);
    console.log(this.btcConvertCADValue.nativeElement.value);
  }

  convertCADtoBTC(): void {
    const cadValue = parseFloat(this.btcConvertCADValue.nativeElement.value.replace(/[$,]/g, '')) || 0;
    const btcValue = cadValue / this.btcToCadPrice;

    this.btcConvertBTCValue.nativeElement.value = btcValue.toFixed(8);
    this.btcConvertSATValue.nativeElement.value = this.formatWithCommas(btcValue * 1e8);
  }

  convertSatoshiToBTC(): void {
    const satValue = parseInt(this.btcConvertSATValue.nativeElement.value.replace(/,/g, ''), 10) || 0;
    const btcValue = satValue / 1e8;

    this.btcConvertBTCValue.nativeElement.value = btcValue.toFixed(8);
    this.btcConvertCADValue.nativeElement.value = this.formatToCanadianCurrency(btcValue * this.btcToCadPrice);
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
}
