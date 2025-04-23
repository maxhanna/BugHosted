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
  @Input() chartTypeInputted?: any = 'line';
  @Input() chartTypeInputtedData2?: any = 'line';
  @Input() width: number = 500;
  @Input() height: number = 300;
  @Input() secondaryDataLabel: string = "Secondary Data";
  @Input() darkMode = false;
  @Input() supportsXYZ = false;
  @Input() graphTitle: string = '';
  @Input() type: "Crypto" | "Currency" | "Volume" = "Crypto";
  @Input() selectedPeriod: '5min' | '15min' | '1h' | '6h' | '12h' | '1d' | '2d' | '5d' | '1m' | '2m' | '3m' | '6m' | '1y' | '2y' | '3y' | '5y' = '1d';
  @Input() showAverage: boolean = false;
  @Input() skipFiltering: boolean = false;
  @Output() fullscreenSelectedEvent = new EventEmitter<any>();
  @Output() changeTimePeriodEvent = new EventEmitter<any>();

  lineChartData: any[] = [];
  lineChartLabels: any[] = [];
  lineChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false
  };
  lineChartLegend = true;
  defaultBorder = undefined;
  fullscreenMode = false;
  @Input() isDotModeData1 = false;
  @Input() isDotModeData2 = false;
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
      this.updateGraph(this.data);
    }, 50);
  }

  ngOnChanges(changes: SimpleChanges) {
    // if (this.selectedCoin) {
    //   this.changeCoinByString(this.selectedCoin);
    // }

    if ((changes['showAverage'] || changes['data'] || changes['data2'] ||
      changes['selectedPeriod'] || changes['selectedCoin']) &&
      this.lineChartData.length > 0) {
      this.updateChartWithAverage();
      this.updateGraph(this.data);
    }
  }

  getUniqueCoinNames(): string[] {
    const uniqueCoinNamesSet = new Set<string>();
    this.data?.forEach(item => {
      if (this.type == "Crypto") {
        if (item.name != "Bitcoin") {
          uniqueCoinNamesSet.add(item.name);
        }
      } else if (this.type == "Currency") {
        const name = (item as ExchangeRate).targetCurrency;
        uniqueCoinNamesSet.add(name);
      }
    });
    return Array.from(uniqueCoinNamesSet);
  }

  changeGraphPeriod(event: Event) {
    console.log("change graph period", event);
    this.selectedPeriod = (event.target as HTMLSelectElement).value as typeof this.selectedPeriod;
    this.changeTimePeriodEvent.emit(this.selectedPeriod);
    // this.updateGraph(this.data); 
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
    const selectedType = (newType as HTMLSelectElement).value;
    this.isDotModeData1 = selectedType === 'dot';
    if (this.validTypes.includes(selectedType as ChartType) || this.isDotModeData1) {
      this.chartTypeInputted = this.isDotModeData1 ? 'line' : selectedType as ChartType;
      this.updateGraph(this.data);
    }
  }

  changeChartTypeData2(newType?: EventTarget | null): void {
    const selectedType = (newType as HTMLSelectElement).value;
    this.isDotModeData2 = selectedType === 'dot';
    if (this.validTypes.includes(selectedType as ChartType) || this.isDotModeData2) {
      this.chartTypeInputtedData2 = this.isDotModeData2 ? 'line' : selectedType as ChartType;
      this.updateGraph(this.data);
    }
  }
  updateGraph(data: any[]) {
    if (!this.selectedPeriod) {
      this.selectedPeriod = '1d';
    }
    this.data = data;
    let filteredData: any[] = [];

    if (this.type === "Volume") {
      filteredData = this.filterDataByPeriod(this.getDaysForPeriod(this.selectedPeriod));
    } else if (this.selectedCoin !== '') {
      filteredData = this.filterDataByPeriodAndCoin(this.selectedPeriod, this.selectedCoin);
    } else {
      filteredData = this.filterDataByPeriod(this.getDaysForPeriod(this.selectedPeriod));
    }
    if (this.selectedPeriod === '5min' && filteredData.length > 100) {
      filteredData = filteredData.filter((_, index) => index % 2 === 0);
    }

    let filteredData2: any[] = [];
    if (this.data2 && this.data2.length > 0) {
      const primaryTimestamps = new Set(filteredData.map(item => item.timestamp));
      filteredData2 = this.data2.filter(item => primaryTimestamps.has(item.timestamp)); 
    } 
    //console.log("filtered data2:",filteredData2);
    let datasets: any[] = [];
    let chartLabelsSet = new Set<string>();

    const colorPalette = [
      '#4e79a7', '#f28e2b', '#e15759', '#76b7b2',
      '#59a14f', '#edc948', '#b07aa1', '#ff9da7',
      '#9c755f', '#bab0ac'
    ];

    if (this.type === "Volume") {
      const volumeConfig: any = {
        type: this.isDotModeData1 ? 'line' : this.chartTypeInputted ?? 'bar',
        data: filteredData.map(item => item.valueCAD),
        label: `${this.selectedCurrency || 'Volume'} (${this.selectedCurrency || ''})`,
        backgroundColor: this.darkMode ? this.getCSSVariableValue("--main-link-color") : this.getCSSVariableValue("--third-font-color") ?? "#000000",
        borderColor: this.darkMode ? this.getCSSVariableValue("--main-link-color") : this.getCSSVariableValue("--third-font-color") ?? "#000000",
        borderJoinStyle: "round",
        tension: 0.2,
        cubicInterpolationMode: 'monotone'
      };

      if (this.isDotModeData1) {
        volumeConfig.showLine = false;
        volumeConfig.pointRadius = 10;
        volumeConfig.pointHoverRadius = 7;
        volumeConfig.borderWidth = 0;
      }

      datasets.push(volumeConfig);
      filteredData.forEach(item => chartLabelsSet.add(this.formatTimestamp(item.timestamp)));
    }

    if (this.data2 && this.data2.length > 0) {
      // Filter data2 to match the selected period
      // filteredData2 = this.filterDataByPeriodForSecondary(
      //   this.getDaysForPeriod(this.selectedPeriod),
      //   this.data2
      // );
    
      // Create value and type maps for data2
      const data2ValueMap = new Map(
        filteredData2.map(item => [
          item.timestamp,
          item.valueCAD ?? item.value ?? item.rate
        ])
      );
      const typeMap = new Map(
        filteredData2.map(item => [item.timestamp, item.type])
      );
    
      // Map each filteredData timestamp to the closest data2 timestamp's value within ±5 minutes
      const secondaryData = filteredData.map(item => {
        const targetTime = new Date(item.timestamp).getTime();
        const data2Timestamps = Array.from(data2ValueMap.keys()).map(ts => ({
          ts,
          time: new Date(ts).getTime()
        }));
    
        if (data2Timestamps.length === 0) return { value: null, type: 'grey' };
    
        // Find the closest data2 timestamp
        const closest = data2Timestamps.reduce((prev, curr) =>
          Math.abs(curr.time - targetTime) < Math.abs(prev.time - targetTime) ? curr : prev
        );
    
        // Check if the closest timestamp is within ±1 minutes (1000 * 60 ms)
        const timeDiff = Math.abs(closest.time - targetTime);
        if (timeDiff > (1000*60)) {
          return { value: null, type: 'grey' };
        }
    
        return {
          value: data2ValueMap.get(closest.ts) ?? null,
          type: typeMap.get(closest.ts) ?? 'grey'
        };
      });
    
      // Create a single secondary dataset
      const secondaryConfig: any = {
        type: this.isDotModeData2 ? 'line' : this.chartTypeInputtedData2 ?? 'line',
        label: this.secondaryDataLabel,
        data: secondaryData.map(d => d.value),
        backgroundColor: secondaryData.map(d => d.type === 'buy' ? 'green' : d.type === 'sell' ? 'red' : 'grey'),
        borderColor: secondaryData.map(d => d.type === 'buy' ? 'green' : d.type === 'sell' ? 'red' : 'grey'),
        pointBackgroundColor: secondaryData.map(d => d.type === 'buy' ? 'green' : d.type === 'sell' ? 'red' : 'grey'),
        pointBorderColor: secondaryData.map(d => d.type === 'buy' ? 'green' : d.type === 'sell' ? 'red' : 'grey'),
        borderWidth: 2,
        order: 1,
        spanGaps: true
      };
    
      if (this.isDotModeData2) {
        secondaryConfig.showLine = false;
        secondaryConfig.pointRadius = 10;
        secondaryConfig.pointHoverRadius = 7;
        secondaryConfig.borderWidth = 0;
      }
    
      datasets.push(secondaryConfig);
    }

    if (this.type !== "Volume") {
      let uniqueCoinNames: string[] = [];
      if (this.type == "Crypto") {
        uniqueCoinNames = Array.from(new Set(filteredData.map(item => item.name)));
      } else if (this.type == "Currency") {
        uniqueCoinNames = Array.from(new Set(filteredData.map(item => item.targetCurrency)));
      }

      if (uniqueCoinNames.length === 0) {
        uniqueCoinNames = ["Value"];
      }

      uniqueCoinNames.forEach((coinName, index) => {
        const coinFilteredData = filteredData.filter(item =>
          this.type == "Crypto" ? item.name === coinName : item.targetCurrency === coinName
        );

        const colorIndex = index % colorPalette.length;
        const baseColor = index == 0 ? this.darkMode ? this.getCSSVariableValue("--main-link-color") : this.getCSSVariableValue("--third-font-color") : colorPalette[colorIndex];

        const datasetConfig: any = {
          data: coinFilteredData.map(item =>
            item.valueCAD ?? item.value ?? item.rate
          ),
          label: `${coinName} Fluctuation ${this.type == "Crypto" && this.selectedCurrency ? `(${this.selectedCurrency}$)` : ""}`,
          backgroundColor: this.hexToRgba(baseColor, 0.2),
          borderColor: baseColor,
          borderWidth: 2,
          borderJoinStyle: "round",
          tension: 0.2,
          cubicInterpolationMode: 'monotone',
          pointBackgroundColor: index == 0 ? this.darkMode ? this.getCSSVariableValue("--main-font-color") : this.getCSSVariableValue("--main-highlight-color") : '#ffffff',
          pointBorderColor: baseColor,
          pointRadius: 3,
          pointHoverRadius: 5
        };

        if (this.isDotModeData1) {
          datasetConfig.showLine = false;
          datasetConfig.pointRadius = 10;
          datasetConfig.pointHoverRadius = 7;
          datasetConfig.borderWidth = 0;
        }

        datasets.push(datasetConfig);
        coinFilteredData.forEach(item => chartLabelsSet.add(this.formatTimestamp(item.timestamp)));
      });
    }

    this.lineChartData = datasets;
    this.lineChartLabels = Array.from(chartLabelsSet).sort();
    this.updateChartWithAverage();

    setTimeout(() => {
      this.chart?.chart?.update('none');
    });
  }

  private formatTimestamp(timestamp: string): string {
    return timestamp.replace('T', ' ').replace(/-/g, '.');
  }

  private filterDataByPeriodForSecondary(periodValue: number, data: any[]): any[] {
    const currentDate = new Date();
    const cutoffDate = new Date(currentDate);

    if (periodValue < 1) {
      if (periodValue < 1 / 24) {
        cutoffDate.setMinutes(currentDate.getMinutes() - Math.round(periodValue * 24 * 60));
      } else {
        cutoffDate.setHours(currentDate.getHours() - Math.round(periodValue * 24));
      }
    } else {
      cutoffDate.setDate(currentDate.getDate() - Math.round(periodValue));
    }

    return data.filter(item => new Date(item.timestamp) >= cutoffDate);
  }

  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  private filterDataByPeriod(periodValue: number): any[] {
    // Sort data by timestamp descending and get the most recent timestamp
    const sortedData = [...this.data].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    if (sortedData.length === 0) return [];

    // Use the latest timestamp as the reference "current date" in UTC
    const latestDate = new Date(sortedData[0].timestamp);
    const currentUTC = new Date(Date.UTC(
      latestDate.getUTCFullYear(),
      latestDate.getUTCMonth(),
      latestDate.getUTCDate(),
      latestDate.getUTCHours(),
      latestDate.getUTCMinutes(),
      latestDate.getUTCSeconds()
    ));

    const cutoffDate = new Date(currentUTC);

    // Calculate cutoff based on periodValue (in days)
    if (periodValue < 1) {
      if (periodValue < 1 / 24) { // Less than 1 hour
        const minutes = periodValue * 24 * 60; // Convert days to minutes
        cutoffDate.setTime(currentUTC.getTime() - minutes * 60000);
      } else {
        const hours = periodValue * 24; // Convert days to hours
        cutoffDate.setTime(currentUTC.getTime() - hours * 3600000);
      }
    } else {
      cutoffDate.setUTCDate(currentUTC.getUTCDate() - Math.round(periodValue));
    }

    // Filter data, converting timestamps to UTC for comparison
    return this.data.filter(item => {
      const itemDate = new Date(item.timestamp);
      const itemUTC = new Date(Date.UTC(
        itemDate.getUTCFullYear(),
        itemDate.getUTCMonth(),
        itemDate.getUTCDate(),
        itemDate.getUTCHours(),
        itemDate.getUTCMinutes(),
        itemDate.getUTCSeconds()
      ));
      return itemUTC >= cutoffDate;
    });
  }

  private filterDataByPeriodAndCoin(period: string, coinName: string): any[] {
    if (this.skipFiltering) return this.data;
    const periodValue = this.getDaysForPeriod(period);
    const currentDate = new Date();
    const cutoffDate = new Date(currentDate);

    if (periodValue < 1) {
      if (periodValue < 1 / 24) {
        const minutes = Math.round(periodValue * 24 * 60);
        cutoffDate.setMinutes(currentDate.getMinutes() - minutes);
      } else {
        const hours = Math.round(periodValue * 24);
        cutoffDate.setHours(currentDate.getHours() - hours);
      }
    } else {
      cutoffDate.setDate(currentDate.getDate() - Math.round(periodValue));
    }

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
    const periodRegex = /^(\d+)\s*(m|min|mins|minute|minutes|h|hour|hours|d|day|days|w|week|weeks|m|month|months|y|year|years)$/;
    const match = period.trim().toLowerCase().match(periodRegex);

    if (match) {
      const value = parseInt(match[1], 10);
      const unit = match[2];

      switch (unit) {
        case 'min':
        case 'mins':
        case 'minute':
        case 'minutes':
          return value / (24 * 60);
        case 'h':
        case 'hour':
        case 'hours':
          return value / 24;
        case 'd':
        case 'day':
        case 'days':
          return value;
          case 'w':
          case 'week':
          case 'weeks':
            return value * 7;
        case 'm':
        case 'month':
        case 'months':
          return value * 30;
        case 'y':
        case 'year':
        case 'years':
          return value * 365;
        default:
          return 1;
      }
    }

    return 1;
  }

  updateChartWithAverage() {
    if (!this.lineChartData || this.lineChartData.length === 0) return;

    this.lineChartData = this.lineChartData.filter(ds => ds.label !== 'Average');

    if (this.showAverage) {
      let totalSum = 0;
      let totalCount = 0;
      let maxLength = 0;

      this.lineChartData.forEach(dataset => {
        const numericData = dataset.data.map(Number);
        totalSum += numericData.reduce((sum: any, value: any) => sum + value, 0);
        totalCount += numericData.length;
        maxLength = Math.max(maxLength, numericData.length);
      });

      const average = totalCount > 0 ? totalSum / totalCount : 0;

      const avgDataset: any = {
        label: 'Average',
        data: new Array(maxLength).fill(average),
        borderColor: 'rgba(255,99,132,0.9)',
        borderWidth: 3,
        borderDash: [5, 5],
        fill: false,
        pointRadius: 0,
        type: 'line',
        zIndex: 0
      };

      this.lineChartData.push(avgDataset);
    }

    setTimeout(() => {
      if (this.chart?.chart) {
        this.chart.chart.update('none');
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
          ticks: {
            color: fontColor,
            maxRotation: 45,
            minRotation: 45,
            autoSkip: true,
            maxTicksLimit: 10
          },
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
          radius: (context: any) => {
            const dataset = context.dataset;
            if (dataset.label === this.secondaryDataLabel) {
              return this.isDotModeData2 ? 10 : 3;
            }
            return this.isDotModeData1 ? 10 : 3;
          },
          hoverRadius: (context: any) => {
            const dataset = context.dataset;
            if (dataset.label === this.secondaryDataLabel) {
              return this.isDotModeData2 ? 12 : 6;
            }
            return this.isDotModeData1 ? 12 : 6;
          },
          hoverBorderWidth: 2
        },
        line: {
          borderWidth: (context: any) => {
            const dataset = context.dataset;
            if (dataset.label === this.secondaryDataLabel) {
              return this.isDotModeData2 ? 0 : 2;
            }
            return this.isDotModeData1 ? 0 : 2;
          },
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
    if (this.type === 'Volume') {
      return this.selectedPeriod ? `Volume (${this.formatPeriodDisplay()})` : 'Volume';
    }

    if (this.graphTitle) {
      return this.selectedCoin.includes('->')
        ? `$Bitcoin/${'$' + this.selectedCurrency} Value` + this.getPeriodSuffix()
        : this.graphTitle + this.getPeriodSuffix();
    }

    const coinPart = this.selectedCoin ? `$${this.selectedCoin}` : '';
    const currencyPart = this.selectedCurrency ? `$${this.selectedCurrency}` : 'CAD';

    return (coinPart
      ? `${coinPart}/${currencyPart} Over Time`
      : `Historical Data (${currencyPart})`) + this.getPeriodSuffix();
  }

  private getPeriodSuffix(): string {
    return this.selectedPeriod ? ` • ${this.formatPeriodDisplay()}` : '';
  }

  formatPeriodDisplay(): string {
    const period = this.selectedPeriod;
    if (!period) return '';
  
    const match = period.match(/^(\d+)(min|m|h|d|w|y)$/);
    if (!match) return period;
  
    const [, valueStr, unit] = match;
    const value = parseInt(valueStr);
  
    const unitNames: { [key: string]: string } = {
      min: 'minute',
      m: 'month',
      h: 'hour',
      d: 'day',
      w: 'week',
      y: 'year'
    };
  
    const unitName = unitNames[unit] || unit;
    const plural = value === 1 ? '' : 's';
  
    return `${value} ${unitName}${plural}`;
  }
  
  exportToCSV() {
    // Get filtered data from the current graph
    let filteredData = [];
    if (this.type === "Volume") {
      filteredData = this.filterDataByPeriod(this.getDaysForPeriod(this.selectedPeriod));
    } else if (this.selectedCoin !== '') {
      filteredData = this.filterDataByPeriodAndCoin(this.selectedPeriod, this.selectedCoin);
    } else {
      filteredData = this.filterDataByPeriod(this.getDaysForPeriod(this.selectedPeriod));
    }

    let filteredData2 = [];
    if (this.data2 && this.data2.length > 0) {
      const primaryTimestamps = new Set(filteredData.map(item => item.timestamp));
      filteredData2 = this.data2.filter(item => primaryTimestamps.has(item.timestamp));
      if (filteredData2.length === 0) {
        filteredData2 = this.filterDataByPeriodForSecondary(
          this.getDaysForPeriod(this.selectedPeriod),
          this.data2
        );
      }
    }

    // Prepare CSV headers and rows
    const headers = ['Timestamp', 'Coin', 'Value', 'Currency', 'Secondary Value', 'Secondary Type'];
    const rows = filteredData.map(item => {
      const secondaryItem = filteredData2.find(s => s.timestamp === item.timestamp);
      const coinName = this.type === "Crypto" ? item.name : this.type === "Currency" ? item.targetCurrency : 'Volume';
      const value = item.valueCAD ?? item.value ?? item.rate ?? '';
      const secondaryValue = secondaryItem ? (secondaryItem.valueCAD ?? secondaryItem.value ?? secondaryItem.rate ?? '') : '';
      const secondaryType = secondaryItem ? secondaryItem.type ?? '' : '';
      return [
        item.timestamp,
        coinName,
        value,
        this.selectedCurrency || 'CAD',
        secondaryValue,
        secondaryType
      ].map(field => `"${field}"`).join(',');
    });

    // Combine headers and rows into CSV content
    const csvContent = [headers.join(','), ...rows].join('\n');

    // Create and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `graph-data-${this.getGraphTitle().replace(/\s+/g, '-')}-${this.selectedPeriod}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } 
} 
