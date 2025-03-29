import { Component, ElementRef, Input, OnChanges, OnInit, ViewChild } from '@angular/core';
 import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts'; 
import { CoinValue } from '../../services/datacontracts/crypto/coin-value';
import { ExchangeRate } from '../../services/datacontracts/crypto/exchange-rate';

@Component({
    selector: 'app-line-graph',
    templateUrl: './line-graph.component.html',
    styleUrls: ['./line-graph.component.css'],
    imports: [BaseChartDirective, CommonModule]
})
export class LineGraphComponent implements OnInit, OnChanges {
  @Input() data: any[] = [];
  @Input() selectedCoin: string = '';
  @Input() selectedCurrency?: string = undefined;
  @Input() displayCoinSwitcher: boolean = true;
  @Input() graphTitle: string = '';
  @Input() type: "Crypto" | "Currency" = "Crypto";
  @Input() selectedPeriod: '1d' | '2d' | '5d' | '1m' | '2m' | '3m' | '6m' | '1y' | '2y' | '3y' | '5y' = '1d';
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
      if (this.type == "Crypto") {
        if (item.name != "Bitcoin") {
          uniqueCoinNamesSet.add(item.name)
        }
      } else if (this.type == "Currency") {
        const name = (item as ExchangeRate).targetCurrency;
        uniqueCoinNamesSet.add(name);
      }
    });
    return Array.from(uniqueCoinNamesSet);
  }

  changeGraphPeriod(event: Event) {
    this.selectedPeriod = (event.target as HTMLSelectElement).value as typeof this.selectedPeriod;
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

  updateGraph(data: any[]) {
    if (!this.selectedPeriod) {
      this.selectedPeriod = '1d';
    }
    this.data = data;
    let filteredData: any[] = []; 
    if (this.selectedCoin !== '') {
      filteredData = this.filterDataByPeriodAndCoin(this.selectedPeriod, this.selectedCoin);
    } else {
      filteredData = this.filterDataByPeriod(this.getDaysForPeriod(this.selectedPeriod));
    }

    // Initialize arrays for datasets and labels
    const datasets: any[] = [];
    const chartLabelsSet = new Set<string>();

    // Get unique coin names from the filtered data
    let uniqueCoinNames = undefined;
    if (this.type == "Crypto") {
      uniqueCoinNames = Array.from(new Set(filteredData.map(item => item.name)))
    } else if (this.type == "Currency") {
      uniqueCoinNames = Array.from(new Set(filteredData.map(item => item.targetCurrency))) 
    }

    if (uniqueCoinNames) {
      if (this.type == "Crypto") {
        uniqueCoinNames.forEach(coinName => {
          const coinFilteredData = filteredData.filter(item => item.name === coinName);
          datasets.push({
            data: coinFilteredData.map(item => item.valueCAD),
            label: `${coinName} Fluctuation (${this.selectedCurrency}$)`,
            borderJoinStyle: "round",
            tension: 0.2,
            cubicInterpolationMode: 'monotone',
          });

          // Add unique timestamps to chartLabelsSet
          coinFilteredData.forEach(item => chartLabelsSet.add(item.timestamp.replace('T', ' ').replace('-', '.')));
        });
      } else if (this.type == "Currency") {
        uniqueCoinNames.forEach(coinName => {
          const coinFilteredData = filteredData.filter(item => item.targetCurrency === coinName);
          datasets.push({
            data: coinFilteredData.map(item => item.rate),
            label: `${coinName} Fluctuation (CAD$)`,
            borderJoinStyle: "round",
            tension: 0.2,
            cubicInterpolationMode: 'monotone',
          });

          // Add unique timestamps to chartLabelsSet
          coinFilteredData.forEach(item => chartLabelsSet.add(item.timestamp.replace('T', ' ').replace('-', '.')));
        });
      }
    } 


    // Convert chartLabelsSet to array
    const chartLabels = Array.from(chartLabelsSet);

    // Update chart data and labels
    this.lineChartData = datasets;
    this.lineChartLabels = chartLabels.length > 0 ? chartLabels : [];
  }

  private filterDataByPeriod(days: number): any[] {
    const currentDate = new Date();
    const cutoffDate = new Date();
    cutoffDate.setDate(currentDate.getDate() - days);

    return this.data.filter(item => new Date(item.timestamp) >= cutoffDate);
  }

  private filterDataByPeriodAndCoin(period: string, coinName: string): any[] {
    const days = this.getDaysForPeriod(period);
    const currentDate = new Date();
    const cutoffDate = new Date();
    cutoffDate.setDate(currentDate.getDate() - days);
    if (this.type == "Crypto") {
      return this.data.filter(item => item.name === coinName && new Date(item.timestamp) >= cutoffDate);
    } else if (this.type == "Currency") {
      return this.data.filter(item => item.targetCurrency === coinName && new Date(item.timestamp) >= cutoffDate);
    }
    else return [];
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
