import { AfterViewInit, Component, Input } from '@angular/core';
import { ChildComponent } from '../child.component';
import { TradeService } from '../../services/trade.service';
import { AppComponent } from '../app.component';

@Component({
  selector: 'app-crypto-coin-volume-graph-viewer',
  standalone: false,
  templateUrl: './crypto-coin-volume-graph-viewer.component.html',
  styleUrl: './crypto-coin-volume-graph-viewer.component.css'
})
export class CryptoCoinVolumeGraphViewerComponent extends ChildComponent implements AfterViewInit {
  constructor(private tradeService: TradeService){ super(); }

  @Input() inputtedParentRef!: AppComponent;
  
  volumeData?: any[] = undefined;

  ngAfterViewInit() {
    this.getVolumeData();
  }

  async getVolumeData() {
    const hours = 6;
    await this.tradeService.getTradeVolumeForGraph(new Date(), hours).then(res => { 
      // Prepare data for the graph - normalized to percentages
      this.volumeData = res.map((item: any) => ({
        timestamp: item.timestamp,
        valueCAD: item.volume,
        valueUSDC: item.volumeUSDC
      }));
    });
  }
  async changeTimePeriodEventOnVolumeGraph(periodSelected: string) {
    this.startLoading();
    const hours = this.tradeService.convertTimePeriodToHours(periodSelected);
    await this.tradeService.getTradeVolumeForGraph(new Date(), hours).then(res => {
      if (res) {
        this.volumeData = res.map((item: any) => ({
          timestamp: item.timestamp,
          valueCAD: item.volume,
          valueUSDC: item.volumeUSDC
        }));
      }
    });
    this.stopLoading();
  }
}
