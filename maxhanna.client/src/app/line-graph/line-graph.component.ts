import { Component, ElementRef, EventEmitter, Input, Output, OnChanges, OnInit, ViewChild, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { CoinValue } from '../../services/datacontracts/crypto/coin-value';
import { ExchangeRate } from '../../services/datacontracts/crypto/exchange-rate';
import { ChartType } from 'chart.js';


@Component({
  selector: 'app-line-graph',
  standalone: true,
  templateUrl: './line-graph.component.html',
  styleUrls: ['./line-graph.component.css'],
  imports: [BaseChartDirective, CommonModule]
})
export class LineGraphComponent implements OnInit, OnChanges {
  @Input() data: any[] = [];
  @Input() data2: any[] = [];
  @Input() selectedCoin: string = '';
  @Input() selectedCurrency?: string = undefined;
  @Input() displayCoinSwitcher: boolean = true;
  @Input() chartTypeInputted?: ChartType = 'line';
  @Input() width: number = 500;
  @Input() height: number = 300;
  @Input() darkMode = false;
  @Input() supportsXYZ = false;
  @Input() graphTitle: string = '';
  @Input() type: "Crypto" | "Currency" | "Volume" = "Crypto";
  @Input() selectedPeriod: '15min' | '1h' | '6h' | '12h' | '1d' | '2d' | '5d' | '1m' | '2m' | '3m' | '6m' | '1y' | '2y' | '3y' | '5y' = '1d';
  @Input() showAverage: boolean = false;
  @Output() fullscreenSelectedEvent = new EventEmitter<any>();

  lineChartData: any[] = [];
  lineChartLabels: any[] = [];
  lineChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false
  };
  lineChartLegend = true;
  defaultBorder = undefined;
  fullscreenMode = false; 
  validTypes: ChartType[] = this.supportsXYZ
    ? ['line', 'bar', 'radar', 'doughnut', 'pie', 'polarArea', 'scatter', 'bubble']
    : ['line', 'bar', 'radar', 'doughnut', 'pie', 'polarArea'];

  @ViewChild('periodSelect') periodSelect!: ElementRef<HTMLSelectElement>;
  @ViewChild('canvasDiv') canvasDiv!: ElementRef<HTMLDivElement>;
  @ViewChild('coinSwitcher') coinSwitcher!: ElementRef<HTMLSelectElement>;
  @ViewChild(BaseChartDirective) chart?: BaseChartDirective;

  ngOnInit() {
    if (!this.selectedPeriod) {
      if (this.type === "Volume") {
        this.selectedPeriod = '1h';
      } else {
        this.selectedPeriod = '1d';  
      }
    } 

    this.lineChartOptions = this.getChartOptions();
    setTimeout(() => {
      this.canvasDiv.nativeElement.style.backgroundColor = this.darkMode ? this.getCSSVariableValue("--secondary-component-background-color") ?? '#000000' : this.getCSSVariableValue("--component-background-color") ?? '#ffffff';
      this.chart?.chart?.update();
       
      this.updateGraph(this.data); 
     
    }, 50);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (this.selectedCoin) {
      this.changeCoinByString(this.selectedCoin);
    }

    if ((changes['showAverage'] || changes['data'] || changes['data2'] ||
      changes['selectedPeriod'] || changes['selectedCoin']) &&
      this.lineChartData.length > 0) {
      this.updateChartWithAverage();
    }
  }
  getUniqueCoinNames(): string[] {
    const uniqueCoinNamesSet = new Set<string>();
    this.data?.forEach(item => {
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

  changeChartType(newType?: EventTarget | null): void {
    if (this.validTypes.includes((newType as HTMLSelectElement).value as ChartType)) {
      this.chartTypeInputted = (newType as HTMLSelectElement).value as ChartType;
    }
  }
  updateGraph(data: any[]) {
    if (!this.selectedPeriod) {
      this.selectedPeriod = '1d';
    }
    this.data = data;
    let filteredData: any[] = [];

    // Handle filtering based on type (keep existing code)
    if (this.type === "Volume") {
      filteredData = this.filterDataByPeriod(this.getDaysForPeriod(this.selectedPeriod));
    } else if (this.selectedCoin !== '') {
      filteredData = this.filterDataByPeriodAndCoin(this.selectedPeriod, this.selectedCoin);
    } else {
      filteredData = this.filterDataByPeriod(this.getDaysForPeriod(this.selectedPeriod));
    }

    const datasets: any[] = [];
    const chartLabelsSet = new Set<string>();

    // Define a color palette that works for both light and dark modes
    const colorPalette = [
      '#4e79a7', // blue
      '#f28e2b', // orange
      '#e15759', // red
      '#76b7b2', // teal
      '#59a14f', // green
      '#edc948', // yellow
      '#b07aa1', // purple
      '#ff9da7', // pink
      '#9c755f', // brown
      '#bab0ac'  // gray
    ];

    // Handle different data types
    if (this.type === "Volume") {
      // Keep your existing volume graph code exactly as is
      datasets.push({
        type: this.chartTypeInputted ?? 'bar',
        data: filteredData.map(item => item.valueCAD),
        label: `${this.selectedCurrency || 'Volume'} (${this.selectedCurrency || ''})`,
        backgroundColor: this.darkMode ? this.getCSSVariableValue("--main-link-color") : this.getCSSVariableValue("--third-font-color") ?? "#000000",
        borderColor: this.darkMode ? this.getCSSVariableValue("--main-link-color") : this.getCSSVariableValue("--third-font-color") ?? "#000000",
        borderJoinStyle: "round",
        tension: 0.2,
        cubicInterpolationMode: 'monotone',
      });

      filteredData.forEach(item => chartLabelsSet.add(item.timestamp.replace('T', ' ').replace('-', '.')));
    }
    else if (this.chartTypeInputted === 'line') {
      // Original logic for other types
      if (this.data2 && this.data2.length) {
        datasets.push({
          type: 'bar',
          label: 'Secondary Bar Data',
          data: this.data2,
          backgroundColor: 'rgba(0, 123, 255, 0.4)',
          borderRadius: 4,
          order: 1
        });
      }
    }

    // Modified logic for Crypto and Currency types with multiple colors
    if (this.type !== "Volume") {
      let uniqueCoinNames: string[] | undefined;
      if (this.type == "Crypto") {
        uniqueCoinNames = Array.from(new Set(filteredData.map(item => item.name)));
      } else if (this.type == "Currency") {
        uniqueCoinNames = Array.from(new Set(filteredData.map(item => item.targetCurrency)));
      }

      if (uniqueCoinNames) {
        uniqueCoinNames.forEach((coinName, index) => {
          const coinFilteredData = filteredData.filter(item =>
            this.type == "Crypto" ? item.name === coinName : item.targetCurrency === coinName
          );

          // Get color from palette (cycles through colors)
          const colorIndex = index % colorPalette.length;
          const baseColor = colorPalette[colorIndex];

          datasets.push({
            data: coinFilteredData.map(item => this.type == "Crypto" ? item.valueCAD : item.rate),
            label: `${coinName} Fluctuation ${this.type == "Crypto" && this.selectedCurrency ? "(" + this.selectedCurrency + "$)" : "(CAD$)"}`,
            backgroundColor: this.hexToRgba(baseColor, 0.2), // Semi-transparent fill
            borderColor: baseColor,
            borderWidth: 2,
            borderJoinStyle: "round",
            tension: 0.2,
            cubicInterpolationMode: 'monotone',
            pointBackgroundColor: '#ffffff',
            pointBorderColor: baseColor,
            pointRadius: 3,
            pointHoverRadius: 5
          });

          coinFilteredData.forEach(item => chartLabelsSet.add(item.timestamp.replace('T', ' ').replace('-', '.')));
        });
      }
    }

    // Update chart data and labels
    this.lineChartData = datasets;
    this.lineChartLabels = Array.from(chartLabelsSet);

    // Handle average AFTER setting main data
    this.updateChartWithAverage();

    // Force chart update
    setTimeout(() => {
      if (this.chart?.chart) {
        this.chart.chart.update('none');
      }
    });
  }

  // Add this helper function to your component class
  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  private filterDataByPeriod(periodValue: number): any[] {
    const currentDate = new Date();
    const cutoffDate = new Date();

    if (periodValue < 1) {
      // Handle sub-day periods (minutes/hours)
      if (periodValue < 1 / 24) {
        // Minutes
        const minutes = Math.round(periodValue * 24 * 60);
        cutoffDate.setMinutes(currentDate.getMinutes() - minutes);
      } else {
        // Hours
        const hours = Math.round(periodValue * 24);
        cutoffDate.setHours(currentDate.getHours() - hours);
      }
    } else {
      // Handle day+ periods
      cutoffDate.setDate(currentDate.getDate() - Math.round(periodValue));
    }

    return this.data.filter(item => new Date(item.timestamp) >= cutoffDate);
  }

  private filterDataByPeriodAndCoin(period: string, coinName: string): any[] {
    const periodValue = this.getDaysForPeriod(period);
    const currentDate = new Date();
    const cutoffDate = new Date(currentDate); // Create a new date object based on current date

    if (periodValue < 1) {
      // Handle sub-day periods (minutes/hours)
      if (periodValue < 1 / 24) {
        // Minutes
        const minutes = Math.round(periodValue * 24 * 60);
        cutoffDate.setMinutes(currentDate.getMinutes() - minutes);
      } else {
        // Hours
        const hours = Math.round(periodValue * 24);
        cutoffDate.setHours(currentDate.getHours() - hours);
      }
    } else {
      // Handle day+ periods
      cutoffDate.setDate(currentDate.getDate() - Math.round(periodValue));
    }

    // For debugging - log the cutoff date
    console.log(`Filtering data for ${coinName} from ${cutoffDate.toISOString()} to now`);

    if (this.type == "Crypto") {
      return this.data.filter(item =>
        item.name === coinName &&
        new Date(item.timestamp) >= cutoffDate
      );
    } else if (this.type == "Currency") {
      return this.data.filter(item =>
        item.targetCurrency === coinName &&
        new Date(item.timestamp) >= cutoffDate
      );
    }
    return [];
  }
  private getDaysForPeriod(period: string): number {
    const periodRegex = /^(\d+)\s*(m|min|mins|h|hour|hours|d|day|days|m|month|months|y|year|years)$/;
    const match = period.trim().toLowerCase().match(periodRegex);

    if (match) {
      const value = parseInt(match[1], 10);
      const unit = match[2];

      switch (unit) { 
        case 'min':
        case 'mins':
          return value / (24 * 60); // Convert minutes to fraction of a day
        case 'h':
        case 'hour':
        case 'hours':
          return value / 24; // Convert hours to fraction of a day
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
          return 1; // Default to 1 day data
      }
    }

    return 1; // Default to 1 day data if input doesn't match
  }
  updateChartWithAverage() {
    if (!this.lineChartData || this.lineChartData.length === 0) return;

    // Remove existing average if any
    this.lineChartData = this.lineChartData.filter(ds => ds.label !== 'Average');

    if (this.showAverage) {
      // Calculate average (your existing calculation code)
      let totalSum = 0;
      let totalCount = 0;
      let maxLength = 0;

      this.lineChartData.forEach(dataset => {
        const numericData = dataset.data.map(Number);
        totalSum += numericData.reduce((sum:any, value:any) => sum + value, 0);
        totalCount += numericData.length;
        maxLength = Math.max(maxLength, numericData.length);
      });

      const average = totalCount > 0 ? totalSum / totalCount : 0;

      // Create and add average dataset LAST (important for z-index)
      const avgDataset = {
        label: 'Average',
        data: new Array(maxLength).fill(average),
        borderColor: 'rgba(255,99,132,0.9)', // More opaque
        borderWidth: 3,
        borderDash: [5, 5],
        fill: false,
        pointRadius: 0,
        type: 'line' as const,
        zIndex: 0 // Let it be behind other elements
      };

      this.lineChartData.push(avgDataset);
    }

    // Force full chart update
    setTimeout(() => {
      if (this.chart?.chart) {
        this.chart.chart.update('none'); // 'none' prevents animation
      }
    });
  }
  getAverage(data: number[]): number {
    const sum = data.reduce((a, b) => a + b, 0);
    return data.length ? sum / data.length : 0;
  }
  openFullscreen() {
    this.fullscreenMode = !this.fullscreenMode;
    this.fullscreenSelectedEvent.emit();
    if (!this.fullscreenMode) {
      setTimeout(() => {
        this.chart?.chart?.resize(this.width, this.height);
        this.updateGraph(this.data);
      }, 50);
    }
  }
  toggleDarkMode() {
    this.darkMode = !this.darkMode;
    this.lineChartOptions = this.getChartOptions();
    this.canvasDiv.nativeElement.style.backgroundColor = this.darkMode ? this.getCSSVariableValue("--secondary-component-background-color") ?? '#000000' : this.getCSSVariableValue("--component-background-color") ?? '#ffffff';
    setTimeout(() => {
      this.chart?.chart?.update(); 
      this.updateGraph(this.data);
    }, 50);
  }
  getChartOptions(): any {
    const fontColor = this.getCSSVariableValue("--main-font-color")
      ?? (this.darkMode ? '#ffffff' : '#000000');
    const backgroundColor = this.coinSwitcher?.nativeElement?.value
      ? (this.darkMode
        ? this.getCSSVariableValue("--secondary-font-color") ?? '#ffffff'
        : this.getCSSVariableValue("--third-font-color") ?? '#000000')
      : undefined;

    return {
      responsive: true,
      maintainAspectRatio: false,
      backgroundColor,
      scales: {
        x: {
          ticks: { color: fontColor },
          grid: { color: fontColor, borderDash: [3, 3] }
        },
        y: {
          ticks: { color: fontColor },
          grid: { color: fontColor, borderDash: [3, 3] }
        }
      },
      plugins: {
        legend: {
          labels: {
            color: fontColor,
            usePointStyle: true,
            padding: 20
          }
        },
        tooltip: {
          backgroundColor: this.darkMode ? '#333' : '#fff',
          titleColor: this.darkMode ? '#fff' : '#000',
          bodyColor: this.darkMode ? '#ccc' : '#000',
          displayColors: true
        }
      },
      elements: {
        point: {
          radius: 3,
          hoverRadius: 6,
          hoverBorderWidth: 2
        },
        line: {
          borderWidth: 2,
          hoverBorderWidth: 3,
          tension: 0.2,
        }, 
      }
    };
  }

  getCSSVariableValue(variableName: string) {
    const styles = getComputedStyle(document.documentElement);
    return styles.getPropertyValue(variableName).trim() ?? undefined;
  }
  getGraphTitle(): string {
    // Handle Volume type
    if (this.type === 'Volume') {
      return this.selectedPeriod ? `Volume (${this.formatPeriodDisplay()})` : 'Volume';
    }

    // If custom title is provided, use it
    if (this.graphTitle) {
      return this.selectedCoin.includes('->')
        ? `$Bitcoin/${'$' + this.selectedCurrency} Value` + this.getPeriodSuffix()
        : this.graphTitle + this.getPeriodSuffix();
    }

    // Default title for other types
    const coinPart = this.selectedCoin ? `$${this.selectedCoin}` : '';
    const currencyPart = this.selectedCurrency ? `$${this.selectedCurrency}` : 'CAD';

    return (coinPart
      ? `${coinPart}/${currencyPart} Over Time`
      : `Historical Data (${currencyPart})`) + this.getPeriodSuffix();
  }

  private getPeriodSuffix(): string {
    return this.selectedPeriod ? ` • ${this.formatPeriodDisplay()}` : '';
  }

  private formatPeriodDisplay(): string {
    const periodMap: { [key: string]: string } = {
      '15m': '15 min',
      '1h': '1 hour',
      '6h': '6 hours',
      '12h': '12 hours',
      '1d': '1 day',
      '2d': '2 days',
      '5d': '5 days',
      '1m': '1 month',
      '2m': '2 months',
      '3m': '3 months',
      '6m': '6 months',
      '1y': '1 year',
      '2y': '2 years',
      '3y': '3 years',
      '5y': '5 years'
    };
    return periodMap[this.selectedPeriod] || this.selectedPeriod;
  }
} 
interface ChartDataset {
  label: string;
  data: number[];
  borderColor?: string;
  borderWidth?: number;
  type?: ChartType; 
}
