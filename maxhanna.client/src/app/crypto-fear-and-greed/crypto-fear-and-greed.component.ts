
import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { CoinValueService, FearGreedPoint } from '../../services/coin-value.service';
import { LineGraphComponent } from '../line-graph/line-graph.component';
import { CommonModule } from '@angular/common';
import { AppComponent } from '../app.component';

@Component({
  selector: 'app-crypto-fear-and-greed',
  templateUrl: './crypto-fear-and-greed.component.html',
  styleUrls: ['./crypto-fear-and-greed.component.css'],
  imports: [LineGraphComponent, CommonModule]
})
export class CryptoFearAndGreedComponent implements OnInit {
  @Input() inputtedParentRef?: AppComponent;
  @ViewChild(LineGraphComponent) lineGraphComponent!: LineGraphComponent;

  constructor(private coinValueService: CoinValueService) {
    this.coinValueService.fetchCryptoFearAndGreed(7).then(res => {
      if (res) {
        this.points = res.indices;
        this.latest = res.indices[0];
        this.fearGreedValue = this.latest?.value ?? 0;
        this.updateLabel(); 

        this.chartDataPoints = this.points.map(point => ({
          timestamp: point.timestampUtc,
          value: point.value,
          name: 'Fear & Greed Index'
        }));
      }
    });
  }

  showHistory = false;
  isInfoPanelOpen = false;
  points: FearGreedPoint[] = [];
  latest?: FearGreedPoint;
  chartDataPoints: any[] = [];

  // Gauge config
  gaugeType: 'full' | 'semi' = 'semi';
  gaugeLabel = 'Fear & Greed';
  gaugeSize = 220;          // px
  gaugeThick = 22;          // px

  // Chart data
  chartData: number[] = [];
  chartLabels: string[] = [];
  chartOptions = {
    responsive: true,
    scales: {
      y: {
        min: 0,
        max: 100
      }
    },
    plugins: {
      legend: {
        display: false
      }
    }
  };

  fearGreedValue = 65; // Set dynamically from your service
  fearGreedLabel = 'Neutral';

  ngOnInit(): void {
    this.updateLabel();
  }

  get arcPath(): string {
    const angle = (this.fearGreedValue / 100) * Math.PI;
    const radius = 90;
    const startX = 10;  // Explicit left start point
    const startY = 100;
    const endX = 100 + radius * Math.cos(angle);
    const endY = 100 - radius * Math.sin(angle);

    return `M ${startX} ${startY} 
            A ${radius} ${radius} 0 ${this.fearGreedValue > 50 ? 1 : 0} 1 ${endX} ${endY}`;
  }

  get needleX(): number {
    // Adjusted angle calculation for perfect alignment
    const angle = ((this.fearGreedValue / 100) * 0.9 + 0.075) * Math.PI;
    return 100 + 80 * Math.cos(angle);
  }

  get needleY(): number {
    const angle = ((this.fearGreedValue / 100) * 0.9 + 0.05) * Math.PI;
    return 100 - 80 * Math.sin(angle);
  }

  calculateArcPath(value: number): string {
    const angle = (value / 100) * Math.PI;
    const endX = 100 + 90 * Math.cos(angle);
    const endY = 100 - 90 * Math.sin(angle);

    // Arc path from starting point (10,100) to calculated end point
    return `M 10 100 A 90 90 0 0 1 ${endX} ${endY}`;
  }


  getColor(value: number): string {
    if (value < 30) return '#d32f2f';    // Fear - Red
    if (value < 70) return '#9e9e9e';    // Neutral - Gray
    return '#4caf50';                    // Greed - Green
  }

  updateLabel(): void {
    const val = this.fearGreedValue;
    if (val < 25) this.fearGreedLabel = 'Extreme Fear';
    else if (val < 50) this.fearGreedLabel = 'Fear';
    else if (val < 75) this.fearGreedLabel = 'Greed';
    else this.fearGreedLabel = 'Extreme Greed';
  }

  openInfoPanel() {
    this.inputtedParentRef?.showOverlay();
    this.isInfoPanelOpen = true;
  }
  closeInfoPanel() {
    this.inputtedParentRef?.closeOverlay();
    this.isInfoPanelOpen = false;
  }
}
