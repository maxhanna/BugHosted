import { AfterViewInit, Component, Input } from '@angular/core';
import { ChildComponent } from '../child.component';
import { TradeService } from '../../services/trade.service';
import { AppComponent } from '../app.component';

import { Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-crypto-coin-volume-graph-viewer',
  standalone: false,
  templateUrl: './crypto-coin-volume-graph-viewer.component.html',
  styleUrl: './crypto-coin-volume-graph-viewer.component.css'
})
export class CryptoCoinVolumeGraphViewerComponent extends ChildComponent implements AfterViewInit {
  constructor(private tradeService: TradeService){ super(); }

  @Input() inputtedParentRef!: AppComponent;
  @Output() volumeDataFetched = new EventEmitter<any[]>();
  
  volumeData?: any[] = undefined;

  ngAfterViewInit() {
    this.getVolumeData();
  }

  async getVolumeData() {
    const hours = 6;
    await this.tradeService.getTradeVolumeForGraph(new Date(), hours).then(res => { 
      // Map backend fields to expected frontend fields
      this.volumeData = res.map((item: any) => ({
        timestamp: item.timestamp,
        volume: item.volume_coin ?? item.volume ?? 0,
        volumeUSDC: item.volume_usdc ?? item.volumeUSDC ?? 0
      }));
      this.volumeDataFetched.emit(this.volumeData);
    });
  }
  async changeTimePeriodEventOnVolumeGraph(periodSelected: string) {
    this.startLoading();
    const hours = this.tradeService.convertTimePeriodToHours(periodSelected);
    await this.tradeService.getTradeVolumeForGraph(new Date(), hours).then(res => {
      if (res) {
        this.volumeData = res.map((item: any) => ({
          timestamp: item.timestamp,
          volume: item.volume_coin ?? item.volume ?? 0,
          volumeUSDC: item.volume_usdc ?? item.volumeUSDC ?? 0
        }));
        this.volumeDataFetched.emit(this.volumeData);
      }
    });
    this.stopLoading();
  }
}
