import { Component, Input, OnInit } from '@angular/core';
import { CoinValue } from '../../services/datacontracts/coin-value';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { tick } from '@angular/core/testing';

@Component({
  standalone: true,
  selector: 'app-line-graph',
  templateUrl: './line-graph.component.html',
  styleUrls: ['./line-graph.component.css'],
  imports: [BaseChartDirective, CommonModule]
})
export class LineGraphComponent implements OnInit {
  @Input() data: CoinValue[] = [];
  @Input() selectedCoin: string = '';
  @Input() displayCoinSwitcher: boolean = true;
  @Input() graphTitle: string = '';
  selectedPeriod: string = '1m'; 
  lineChartData: any[] = [];
  lineChartLabels: any[] = [];
  lineChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false
  };
  lineChartLegend = true;

  ngOnInit() {
    this.updateGraph(this.data);
  }

  changeGraphPeriod(period: string) {
    this.selectedPeriod = period;
    this.updateGraph(this.data);
  }

  getUniqueCoinNames(): string[] {
    const uniqueCoinNamesSet = new Set<string>();
    this.data.forEach(item => uniqueCoinNamesSet.add(item.name));
    return Array.from(uniqueCoinNamesSet);
  }

  changeCoin(event: Event) {
    this.selectedCoin = (event.target as HTMLSelectElement).value;
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
    const rootStyles = getComputedStyle(document.documentElement);
    const primaryFontColor = rootStyles.getPropertyValue('--primary-font-color').trim();
    const mainBackgroundColor = rootStyles.getPropertyValue('--secondary-font-color').trim();

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
    switch (period) {
      case '1d': return 1;
      case '1m': return 30;
      case '3m': return 90;
      case '6m': return 180;
      case '1y': return 365;
      case '3y': return 1095;
      case '5y': return 1825;
      default: return 30; // Default to 1 month data
    }
  }
}
