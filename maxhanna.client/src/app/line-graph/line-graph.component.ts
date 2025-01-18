import { Component, ElementRef, Input, OnChanges, OnInit, ViewChild } from '@angular/core';
 import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts'; 
import { CoinValue } from '../../services/datacontracts/crypto/coin-value';

@Component({
  standalone: true,
  selector: 'app-line-graph',
  templateUrl: './line-graph.component.html',
  styleUrls: ['./line-graph.component.css'],
  imports: [BaseChartDirective, CommonModule]
})
export class LineGraphComponent implements OnInit, OnChanges {
  @Input() data: CoinValue[] = [];
  @Input() selectedCoin: string = '';
  @Input() displayCoinSwitcher: boolean = true;
  @Input() graphTitle: string = '';
  selectedPeriod: string = '1d'; 
  lineChartData: any[] = [];
  lineChartLabels: any[] = [];
  lineChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false
  };
  lineChartLegend = true;

  @ViewChild('periodSelect') periodSelect!: ElementRef<HTMLSelectElement>;

  ngOnInit() {
    this.updateGraph(this.data);
  }

  ngOnChanges() { 
    if (this.selectedCoin) {
      this.changeCoinByString(this.selectedCoin);
    }
  }
  getUniqueCoinNames(): string[] {
    const uniqueCoinNamesSet = new Set<string>();
    this.data.forEach(item => {
      if (item.name != "Bitcoin") {
        uniqueCoinNamesSet.add(item.name)
      }
    });
    return Array.from(uniqueCoinNamesSet);
  }

  changeGraphPeriod(event: Event) {
    this.selectedPeriod = (event.target as HTMLSelectElement).value;
    this.updateGraph(this.data);
  }

  changeCoin(event: Event) {
    this.selectedCoin = (event.target as HTMLSelectElement).value;
    this.updateGraph(this.data);
  }

  changeCoinByString(coin: string) {
    this.selectedCoin = coin;
    this.updateGraph(this.data);
  }

  updateGraph(data: CoinValue[]) {
    this.data = data;
    let filteredData: CoinValue[] = []; 
    if (this.selectedCoin !== '') {
      filteredData = this.filterDataByPeriodAndCoin(this.selectedPeriod, this.selectedCoin);
    } else {
      filteredData = this.filterDataByPeriod(this.getDaysForPeriod(this.selectedPeriod));
    }

    // Initialize arrays for datasets and labels
    const datasets: any[] = [];
    const chartLabelsSet = new Set<string>();

    // Get unique coin names from the filtered data
    const uniqueCoinNames = Array.from(new Set(filteredData.map(item => item.name)));
 
    // Create datasets for each unique coin
    uniqueCoinNames.forEach(coinName => {
      const coinFilteredData = filteredData.filter(item => item.name === coinName);
      datasets.push({
        data: coinFilteredData.map(item => item.valueCAD),
        label: `${coinName} Fluctuation (CAD$)`,
        borderJoinStyle: "round",
        tension: 0.2,
        cubicInterpolationMode: 'monotone',
      });

      // Add unique timestamps to chartLabelsSet
      coinFilteredData.forEach(item => chartLabelsSet.add(item.timestamp.replace('T', ' ').replaceAll('-','.')));
    });

    // Convert chartLabelsSet to array
    const chartLabels = Array.from(chartLabelsSet);

    // Update chart data and labels
    this.lineChartData = datasets;
    this.lineChartLabels = chartLabels.length > 0 ? chartLabels : [];
  }

  private filterDataByPeriod(days: number): CoinValue[] {
    const currentDate = new Date();
    const cutoffDate = new Date();
    cutoffDate.setDate(currentDate.getDate() - days);

    return this.data.filter(item => new Date(item.timestamp) >= cutoffDate);
  }

  private filterDataByPeriodAndCoin(period: string, coinName: string): CoinValue[] {
    const days = this.getDaysForPeriod(period);
    const currentDate = new Date();
    const cutoffDate = new Date();
    cutoffDate.setDate(currentDate.getDate() - days);

    return this.data.filter(item => item.name === coinName && new Date(item.timestamp) >= cutoffDate);
  }

  private getDaysForPeriod(period: string): number {
    const periodRegex = /^(\d+)\s*(d|day|days|m|month|months|y|year|years)$/;
    const match = period.trim().toLowerCase().match(periodRegex);

    if (match) {
      const value = parseInt(match[1], 10);
      const unit = match[2];

      switch (unit) {
        case 'd':
        case 'day':
        case 'days':
          return value;
        case 'm':
        case 'month':
        case 'months':
          return value * 30; // Approximate number of days in a month
        case 'y':
        case 'year':
        case 'years':
          return value * 365; // Approximate number of days in a year
        default:
          return 30; // Default to 1 month data
      }
    }

    return 30; // Default to 1 month data if input doesn't match
  }
}
