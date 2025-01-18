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
   

  @ViewChild(LineGraphComponent) lineGraphComponent!: LineGraphComponent;
  @ViewChild('btcConvertSATValue') btcConvertSATValue!: ElementRef<HTMLInputElement>;
  @ViewChild('btcConvertCADValue') btcConvertCADValue!: ElementRef<HTMLInputElement>;
  @ViewChild('btcConvertBTCValue') btcConvertBTCValue!: ElementRef<HTMLInputElement>;
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
    await this.getNicehashWallets();

    if (this.parentRef?.user) {
      await this.userService.getBTCWallet(this.parentRef.user).then(res => {
        this.btcWalletResponse = res;
      });
    }

    if (this.wallet && this.wallet.currencies) {
      // Find the BTC currency in this.wallet
      const walletBTC = this.wallet.currencies.find(
        (x) => x.currency?.toUpperCase() === "BTC"
      );

      // Get the total BTC balance from btcWalletResponse
      const btcWalletResponseBalance = this.btcWalletResponse?.currencies?.find(
        (x) => x.currency?.toUpperCase() === "BTC"
      )?.totalBalance || 0;

      const btcWalletResponseAvailable = this.btcWalletResponse?.currencies?.find(
        (x) => x.currency?.toUpperCase() === "BTC"
      )?.available || 0;

      // Calculate the total BTC balance
      const totalBTCBalance =
        (walletBTC?.totalBalance ? Number(walletBTC.totalBalance) : 0) +
        Number(btcWalletResponseBalance);

      const availableBTCBalance =
        (walletBTC?.available ? Number(walletBTC.available) : 0) +
        Number(btcWalletResponseAvailable);
         
      this.wallet.total = ({
        currency: "Total BTC",
        totalBalance: totalBTCBalance.toString(),
        available: availableBTCBalance.toString(),
        debt: 0,
        pending: 0,
      } as any);
     
    }
  }

  private async getNicehashWallets() {
    const res = await this.miningService.getMiningWallet(this.parentRef?.user!);
    if (res) {
      this.wallet = res;
      if (this.wallet && this.wallet.currencies) {
        this.btcFiatConversion = this.wallet.currencies!.find(x => x.currency?.toUpperCase() == "BTC")?.fiatRate;
      }
    }
  }

  calculateTotalValue(currency: Currency): number {
    if (currency && (currency.fiatRate || this.btcFiatConversion) && currency.totalBalance) {
      return (currency.fiatRate ? currency.fiatRate : this.btcFiatConversion ?? 1) * (Number)(currency.totalBalance);
    } else {
      return 0;
    }
  }
  multiplyValues(number1: any, number2: any): string {
    if (number1 && number2) {
      return ((Number)(number1) * (Number)(number2)).toFixed(2);
    } else {
      return "";
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
   
  private formatWithCommas(value: number): string {
    return value.toLocaleString('en-US');
  }

}
