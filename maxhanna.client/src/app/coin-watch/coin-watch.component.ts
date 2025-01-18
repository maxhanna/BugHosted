import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component'; 
import { CoinValueService } from '../../services/coin-value.service';
import { LineGraphComponent } from '../line-graph/line-graph.component';
import { CoinValue } from '../../services/datacontracts/crypto/coin-value';
import { AppComponent } from '../app.component';
  
@Component({ 
  selector: 'app-coin-watch',
  templateUrl: './coin-watch.component.html',
  styleUrl: './coin-watch.component.css',
})


export class CoinWatchComponent extends ChildComponent implements OnInit {
  data?: CoinValue[];
  allHistoricalData?: CoinValue[] = [];
  btcToCadPrice = 0;
  @ViewChild(LineGraphComponent) lineGraphComponent!: LineGraphComponent;
  @Input() inputtedParentRef?: AppComponent;

  constructor(private coinValueService: CoinValueService) { super(); }

  async ngOnInit() {
    this.startLoading();
    try {
      this.data = await this.coinValueService.getLatestCoinValues();
      this.allHistoricalData = await this.coinValueService.getAllCoinValues();
      await this.coinValueService.getLatestCoinValuesByName("Bitcoin").then(res => {
        if (res) {
          this.btcToCadPrice = res.valueCAD;
        }
      }); 
    } catch (error) {
      console.error('Error fetching coin values:', error);
    }
    this.stopLoading();
  }
}
