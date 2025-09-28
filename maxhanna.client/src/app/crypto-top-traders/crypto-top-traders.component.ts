import { Component, Input, OnInit } from '@angular/core';
import { TradeService } from '../../services/trade.service';
import { AppComponent } from '../app.component';

@Component({
  selector: 'app-crypto-top-traders',
  standalone: false,
  templateUrl: './crypto-top-traders.component.html',
  styleUrls: ['./crypto-top-traders.component.css']
})
export class CryptoTopTradersComponent implements OnInit {
  @Input() inputtedParentRef?: AppComponent;
  
  topActiveUsers: { userId: number; trades: number }[] = [];

  constructor(private tradeService: TradeService) {}
 
  get hasUsers(): boolean {
    return this.topActiveUsers && this.topActiveUsers.length > 0;
  }

  async ngOnInit() {
    await this.loadTopActiveUsersByTrades();
  }

  async loadTopActiveUsersByTrades(strategy?: string, from?: Date, to?: Date, limit: number = 20) {
    try {
      const res: any = await this.tradeService.getTopActiveUsersByTradeCount(strategy, from, to, limit);
      if (Array.isArray(res)) {
        this.topActiveUsers = res.map((r: any) => ({ userId: r.userId ?? r.user_id ?? 0, trades: r.trades ?? r.trades ?? 0 }));
      }
    } catch (err) {
      console.error('Failed to load top active users', err);
    }
  }
}
