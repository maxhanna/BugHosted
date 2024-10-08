import { Component, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component'; 
import { CoinValueService } from '../../services/coin-value.service';
import { LineGraphComponent } from '../line-graph/line-graph.component';
import { CoinValue } from '../../services/datacontracts/crypto/coin-value';
  
@Component({ 
  selector: 'app-coin-watch',
  templateUrl: './coin-watch.component.html',
  styleUrl: './coin-watch.component.css',
})


export class CoinWatchComponent extends ChildComponent implements OnInit {
  data?: CoinValue[];
  allHistoricalData?: CoinValue[] = [];

  @ViewChild(LineGraphComponent) lineGraphComponent!: LineGraphComponent; 
  constructor(private coinValueService: CoinValueService) { super(); }

  async ngOnInit() {
    this.startLoading();
    try {
      this.data = await this.coinValueService.getLatestCoinValues();
      this.allHistoricalData = await this.coinValueService.getAllCoinValues(); 
    } catch (error) {
      console.error('Error fetching coin values:', error);
    }
    this.stopLoading();
  }
}
