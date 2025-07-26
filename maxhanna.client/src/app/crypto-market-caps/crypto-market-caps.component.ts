import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { ChildComponent } from '../child.component';
import { CoinValueService } from '../../services/coin-value.service';

@Component({
  selector: 'app-crypto-market-caps',
  standalone: false,
  templateUrl: './crypto-market-caps.component.html',
  styleUrl: './crypto-market-caps.component.css'
})
export class CryptoMarketCapsComponent extends ChildComponent implements OnInit {
  coinMarketCaps: any;
  expand = false;
  @Input() conversionRate?: number;
  @Input() selectedCurrency?: string;
  @Output() selectCoin = new EventEmitter<string>();
 
  constructor(private readonly coinService: CoinValueService) { super(); }
  ngOnInit() {
    this.coinService.getLatestCoinMarketCaps().then(res => { 
        this.coinMarketCaps = res;
      }  
    );
  } 

  get totalMarketCap(): number {
    return this.coinMarketCaps?.reduce((sum: number, coin: any) => sum + coin.market_cap_usd, 0) ?? 0;
  }
}
