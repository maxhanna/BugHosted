import { Component, OnInit } from '@angular/core';
import { ChildComponent } from '../child.component';
import { CoinWatchResponse } from '../../services/datacontracts/coin-watch-response';
import { CoinWatchService } from '../../services/coin-watch.service';

@Component({
  selector: 'app-coin-watch',
  templateUrl: './coin-watch.component.html',
  styleUrl: './coin-watch.component.css'
})


export class CoinWatchComponent extends ChildComponent implements OnInit {
  data?: CoinWatchResponse[];
  constructor(private coinwatchService: CoinWatchService) { super(); }
  async ngOnInit() {
    this.startLoading();
    this.data = await this.coinwatchService.getCoinwatchResponse(this.parentRef?.user!);
    this.stopLoading();
  }
}
