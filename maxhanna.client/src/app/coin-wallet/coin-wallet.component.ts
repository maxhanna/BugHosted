import { Component, OnInit } from '@angular/core';
import { ChildComponent } from '../child.component';
import { Currency, MiningWalletResponse } from '../mining-wallet-response';
import { lastValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-coin-wallet',
  templateUrl: './coin-wallet.component.html',
  styleUrl: './coin-wallet.component.css'
})
export class CoinWalletComponent extends ChildComponent implements OnInit {
  wallet = new MiningWalletResponse();
  btcFiatConversion? : number = 0;
  constructor(private http: HttpClient) {
    super();
  }
  ngOnInit() {
    this.promiseWrapper(lastValueFrom(this.http.get<MiningWalletResponse>('/mining/wallet'))).then(res => {
      this.wallet = res;
      this.btcFiatConversion = this.wallet!.currencies!.find(x => x.currency?.toUpperCase() == "BTC")?.fiatRate!;
    });
  }
  calculateTotalValue(currency: Currency): number {
    if (currency && currency.fiatRate && currency.totalBalance) {
      return currency.fiatRate * (Number)(currency.totalBalance);
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
}
