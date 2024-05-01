import { Component, OnInit } from '@angular/core';
import { ChildComponent } from '../child.component';
import { MiningWalletResponse } from '../mining-wallet-response';
import { lastValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-coin-wallet',
  templateUrl: './coin-wallet.component.html',
  styleUrl: './coin-wallet.component.css'
})
export class CoinWalletComponent extends ChildComponent implements OnInit {
  wallet = new MiningWalletResponse();
  constructor(private http: HttpClient) {
    super();
  }
  ngOnInit() {
    this.promiseWrapper(lastValueFrom(this.http.get<MiningWalletResponse>('/mining/wallet'))).then(res => this.wallet = res);
  }
}
