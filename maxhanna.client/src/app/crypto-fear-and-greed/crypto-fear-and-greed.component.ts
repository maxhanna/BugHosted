import { Component, Input, OnInit, ViewChild, ElementRef } from '@angular/core';
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
  @ViewChild('gaugeSvg', { static: false }) gaugeSvg!: ElementRef<SVGSVGElement>;

  constructor(private coinValueService: CoinValueService) {
    this.coinValueService.fetchCryptoFearAndGreed(365).then(res => {
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
  gaugeSize = 220; // px
  gaugeThick = 22; // px

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

  fearGreedValue = 0;
  fearGreedLabel = 'Neutral';

  ngOnInit(): void {
    this.updateLabel();
  }

  ngAfterViewInit(): void {
    // Log transforms for SVG and parents
    if (this.gaugeSvg) {
      let el: Element | null = this.gaugeSvg.nativeElement; // Use Element to support SVGSVGElement and HTMLElement
      while (el) {
        const transform = getComputedStyle(el).transform;
        const direction = getComputedStyle(el).direction; 
        el = el.parentElement;
      }
    }
  }

  get arcPath(): string {
    const angleDeg = 135 - (this.fearGreedValue / 100) * 180;
    const angle = (angleDeg * Math.PI) / 180;
    const radius = 90;
    const startX = 10;
    const startY = 100;
    const endX = 100 + radius * Math.cos(angle);
    const endY = 100 - radius * Math.sin(angle); 
    return `M ${startX} ${startY} A ${radius} ${radius} 0 ${this.fearGreedValue > 50 ? 1 : 0} 1 ${endX} ${endY}`;
  }

  get needleX(): number {
    // Start at 180° (left side) and go to 0° (right side) as value goes from 0 to 100
    const angleDeg = 180 - (this.fearGreedValue / 100) * 180;
    const angle = (angleDeg * Math.PI) / 180;
    const radius = 80;
    return 100 + radius * Math.cos(angle);
  }

  get needleY(): number {
    const angleDeg = 180 - (this.fearGreedValue / 100) * 180;
    const angle = (angleDeg * Math.PI) / 180;
    const radius = 80;
    return 100 - radius * Math.sin(angle);
  }

  getColor(value: number): string {
    if (value < 30) return '#d32f2f'; // Fear - Red
    if (value < 70) return '#9e9e9e'; // Neutral - Gray
    return '#4caf50'; // Greed - Green
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