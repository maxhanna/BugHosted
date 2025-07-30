import { Component, ElementRef, EventEmitter, Input, Output, OnChanges, OnInit, ViewChild, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { CoinValue } from '../../services/datacontracts/crypto/coin-value';
import { ExchangeRate } from '../../services/datacontracts/crypto/exchange-rate';
import { ChartType } from 'chart.js';

interface MacdDataPoint {
  timestamp: string;
  macdLine: number | null;
  signalLine: number | null;
  histogram: number | null;
  price: number | null;
}

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
  @Input() selectedCurrencyDisplay?: string = undefined;
  @Input() displayCoinSwitcher: boolean = true;
  @Input() chartTypeInputted?: ChartType = 'line';
  @Input() chartTypeInputtedData2?: ChartType = 'line';
  @Input() width: number = 500;
  @Input() height: number = 300;
  @Input() secondaryDataLabel: string = "Secondary Data";
  @Input() darkMode = false;
  @Input() supportsXYZ = false;
  @Input() graphTitle: string = '';
  @Input() type: "Crypto" | "Currency" | "Volume" | "MACD" = "Crypto";
  @Input() selectedPeriod: '5min' | '15min' | '1h' | '6h' | '12h' | '1d' | '2d' | '5d' | '1w' | '2w' | '3w' | '1m' | '2m' | '3m' | '6m' | '1y' | '2y' | '3y' | '5y' | 'max' = '1d';
  @Input() showAverage: boolean = false;
  @Input() showMacdLine: boolean = true;
  @Input() showSignalLine: boolean = true;
  @Input() showHistogram: boolean = true;
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
  currentSecondaryData: { priceCAD: number | null, tradeValueCAD: string | null, type: string }[] = [];

  @ViewChild('periodSelect') periodSelect!: ElementRef<HTMLSelectElement>;
  @ViewChild('canvasDiv') canvasDiv!: ElementRef<HTMLDivElement>;
  @ViewChild('sliderContainer') sliderContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('coinSwitcher') coinSwitcher!: ElementRef<HTMLSelectElement>;
  @ViewChild(BaseChartDirective) chart?: BaseChartDirective;
  @ViewChild('timeRangeSliderMin') timeRangeSliderMin!: ElementRef<HTMLInputElement>;
  @ViewChild('timeRangeSliderMax') timeRangeSliderMax!: ElementRef<HTMLInputElement>;

  sliderMin: number = 0;
  sliderMax: number = 0;
  sliderMinValue: number = 0;
  sliderMaxValue: number = 0;
  isShowingOptions = false;
  private readonly minSeparation: number = 1000; // 1 second

  get formattedSliderMin(): string {
    return this.formatTimestamp(new Date(this.sliderMinValue).toISOString(), true);
  }

  get formattedSliderMax(): string {
    return this.formatTimestamp(new Date(this.sliderMaxValue).toISOString(), true);
  }

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
      this.canvasDiv.nativeElement.style.backgroundColor = this.darkMode
        ? this.getCSSVariableValue("--secondary-component-background-color") ?? '#000000'
        : this.getCSSVariableValue("--component-background-color") ?? '#ffffff';
      this.initializeSlider();
      this.updateGraph(this.data);
    }, 500);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['data'] || changes['data2']) {
      this.initializeSlider();
      this.updateGraph(this.data);
    }
    if ((changes['showAverage'] || changes['selectedPeriod'] || changes['selectedCoin'] || changes['showMacdLine'] || changes['showSignalLine'] || changes['showHistogram']) &&
      this.lineChartData.length > 0) {
      this.updateChartWithAverage();
      this.updateGraph(this.data);
    }
  }

  initializeSlider() {
    if (this.data.length === 0) return;

    const timestamps = this.data.map(item => new Date(item.timestamp).getTime()).filter(time => !isNaN(time));
    if (timestamps.length === 0) return;

    this.sliderMin = Math.min(...timestamps);
    this.sliderMax = Math.max(...timestamps);
    this.sliderMinValue = this.sliderMin;
    this.sliderMaxValue = this.sliderMax;

    setTimeout(() => {
      if (this.timeRangeSliderMin && this.timeRangeSliderMax) {
        this.timeRangeSliderMin.nativeElement.value = this.sliderMinValue.toString();
        this.timeRangeSliderMax.nativeElement.value = this.sliderMaxValue.toString();
        this.updateHighlightedRange();
        this.timeRangeSliderMin.nativeElement.dispatchEvent(new Event('input'));
        this.timeRangeSliderMax.nativeElement.dispatchEvent(new Event('input'));
      }
    }, 100);
  }

  updateSliderMin(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value);
    if (value >= this.sliderMaxValue - this.minSeparation) {
      this.sliderMinValue = this.sliderMaxValue - this.minSeparation;
      this.timeRangeSliderMin.nativeElement.value = this.sliderMinValue.toString();
    } else {
      this.sliderMinValue = value;
    }
    this.updateHighlightedRange();
    this.updateGraph(this.data);
  }

  updateSliderMax(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value);
    if (value <= this.sliderMinValue + this.minSeparation) {
      this.sliderMaxValue = this.sliderMinValue + this.minSeparation;
      this.timeRangeSliderMax.nativeElement.value = this.sliderMaxValue.toString();
    } else {
      this.sliderMaxValue = value;
    }
    this.updateHighlightedRange();
    this.updateGraph(this.data);
  }

  getUniqueCoinNames(): string[] {
    const uniqueCoinNamesSet = new Set<string>();
    this.data?.forEach(item => {
      if (this.type === "Crypto" || this.type === "MACD") {
        uniqueCoinNamesSet.add(item.name || this.selectedCoin);
      } else if (this.type === "Currency") {
        uniqueCoinNamesSet.add((item as ExchangeRate).targetCurrency);
      }
    });
    return Array.from(uniqueCoinNamesSet);
  }

  private updateHighlightedRange() {
    if (!this.sliderContainer) return;

    const sliderWidth = this.sliderContainer.nativeElement.offsetWidth - 40; // Adjust for 20px padding on each side
    const range = this.sliderMax - this.sliderMin;

    if (range <= 0) return;

    const minPercent = ((this.sliderMinValue - this.sliderMin) / range) * 100;
    const maxPercent = ((this.sliderMaxValue - this.sliderMin) / range) * 100;

    const left = (minPercent * sliderWidth) / 100 + 20; // Offset by left padding
    const width = ((maxPercent - minPercent) * sliderWidth) / 100;

    this.sliderContainer.nativeElement.style.setProperty('--highlight-left', `${left}px`);
    this.sliderContainer.nativeElement.style.setProperty('--highlight-width', `${width}px`);
  }

  changeGraphPeriod(event: Event) {
    this.selectedPeriod = (event.target as HTMLSelectElement).value as typeof this.selectedPeriod;
    this.changeTimePeriodEvent.emit(this.selectedPeriod);
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
    const selectedType = (newType as HTMLSelectElement).value;
    if (this.type === 'MACD' && selectedType === 'dot') {
      return; // Prevent dot mode for MACD
    }
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
    this.lineChartData = [];
    this.lineChartLabels = [];

    // Apply period and coin filtering
    if (this.type === "Volume") {
      filteredData = this.filterDataByPeriod(this.getDaysForPeriod(this.selectedPeriod));
    } else if (this.type === "MACD") {
      filteredData = this.filterDataByPeriod(this.getDaysForPeriod(this.selectedPeriod));
    } else if (this.selectedCoin !== '') {
      filteredData = this.filterDataByPeriodAndCoin(this.selectedPeriod, this.selectedCoin);
    } else {
      filteredData = this.filterDataByPeriod(this.getDaysForPeriod(this.selectedPeriod));
    }

    // Apply slider time range filtering
    filteredData = this.filterDataBySliderRange(filteredData);

    if (this.selectedPeriod === '5min' && filteredData.length > 100) {
      filteredData = filteredData.filter((_, index) => index % 2 === 0);
    }

    // Filter data2 by period and slider range
    let filteredData2: any[] = [];
    let hasValidSecondaryData = false;

    if (this.data2 && this.data2.length > 0) {
      filteredData2 = this.filterDataByPeriodForSecondary(
        this.getDaysForPeriod(this.selectedPeriod),
        this.data2
      );
      filteredData2 = this.filterDataBySliderRange(filteredData2);
      hasValidSecondaryData = filteredData2.length > 0;
    }

    let datasets: any[] = [];
    let chartLabelsSet = new Set<string>();
    const colorPalette = [
      '#4e79a7', '#f28e2b', '#e15759', '#76b7b2',
      '#59a14f', '#edc948', '#b07aa1', '#ff9da7',
      '#9c755f', '#bab0ac'
    ];

    // Add timestamps to chartLabelsSet
    filteredData.forEach(item => chartLabelsSet.add(this.formatTimestamp(item.timestamp, true)));

    // Add timestamps from filteredData2 to chartLabelsSet
    filteredData2.forEach(item => chartLabelsSet.add(this.formatTimestamp(item.timestamp, true)));

    // Sort labels to ensure chronological order
    const sortedLabels = Array.from(chartLabelsSet).sort((a, b) => {
      const dateA = new Date(a.replace(/\./g, '-').replace(' ', 'T') + 'Z');
      const dateB = new Date(b.replace(/\./g, '-').replace(' ', 'T') + 'Z');
      return dateA.getTime() - dateB.getTime();
    });

    if (this.type === "MACD") {
      // Handle MACD-specific data (MacdDataPoint)
      const macdData = filteredData as MacdDataPoint[];

      if (this.showMacdLine) {
        datasets.push({
          type: 'line',
          label: 'MACD Line (12,26)',
          data: sortedLabels.map(label => {
            const item = macdData.find(d => this.formatTimestamp(d.timestamp, true) === label);
            return item ? (item.macdLine ?? 0) : null;
          }),
          borderColor: '#007bff',
          backgroundColor: 'transparent',
          yAxisID: 'y',
          pointRadius: this.isDotModeData1 ? 10 : 3,
          pointHoverRadius: this.isDotModeData1 ? 12 : 6,
          showLine: !this.isDotModeData1,
          borderWidth: this.isDotModeData1 ? 0 : 2,
          tension: 0.2,
          cubicInterpolationMode: 'monotone',
          spanGaps: true
        });
      }

      if (this.showSignalLine) {
        datasets.push({
          type: 'line',
          label: 'Signal Line (9)',
          data: sortedLabels.map(label => {
            const item = macdData.find(d => this.formatTimestamp(d.timestamp, true) === label);
            return item ? (item.signalLine ?? 0) : null;
          }),
          borderColor: '#ff9900',
          backgroundColor: 'transparent',
          yAxisID: 'y',
          pointRadius: this.isDotModeData1 ? 10 : 3,
          pointHoverRadius: this.isDotModeData1 ? 12 : 6,
          showLine: !this.isDotModeData1,
          borderWidth: this.isDotModeData1 ? 0 : 2,
          tension: 0.2,
          cubicInterpolationMode: 'monotone',
          spanGaps: true
        });
      }

      if (this.showHistogram) {
        datasets.push({
          type: 'bar',
          label: 'Histogram',
          data: sortedLabels.map(label => {
            const item = macdData.find(d => this.formatTimestamp(d.timestamp, true) === label);
            return item ? (item.histogram ?? 0) : null;
          }),
          backgroundColor: sortedLabels.map((label, index) => {
            const item = macdData.find(d => this.formatTimestamp(d.timestamp, true) === label);
            return item && (item.histogram ?? 0) >= 0 ? 'rgba(0, 200, 0, 0.5)' : 'rgba(200, 0, 0, 0.5)';
          }),
          borderColor: sortedLabels.map((label, index) => {
            const item = macdData.find(d => this.formatTimestamp(d.timestamp, true) === label);
            return item && (item.histogram ?? 0) >= 0 ? 'rgba(0, 200, 0, 1)' : 'rgba(200, 0, 0, 1)';
          }),
          yAxisID: 'y',
          barPercentage: 0.4,
          categoryPercentage: 0.5
        });
      }

      datasets.push({
        type: 'line',
        label: `${this.selectedCoin} Price`,
        data: sortedLabels.map(label => {
          const item = macdData.find(d => this.formatTimestamp(d.timestamp, true) === label);
          return item ? (item.price ?? 0) : null;
        }),
        borderColor: '#888',
        backgroundColor: 'transparent',
        yAxisID: 'y1',
        pointRadius: this.isDotModeData1 ? 10 : 3,
        pointHoverRadius: this.isDotModeData1 ? 12 : 6,
        showLine: !this.isDotModeData1,
        borderWidth: this.isDotModeData1 ? 0 : 2,
        tension: 0.2,
        cubicInterpolationMode: 'monotone',
        spanGaps: true
      });
    } else if (this.type === "Volume") {
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
    } else {
      let uniqueCoinNames: string[] = [];
      if (this.type === "Crypto") {
        uniqueCoinNames = Array.from(new Set(filteredData.map(item => item.name)));
      } else if (this.type === "Currency") {
        uniqueCoinNames = Array.from(new Set(filteredData.map(item => item.targetCurrency)));
      }

      if (uniqueCoinNames.length === 0) {
        uniqueCoinNames = ["Value"];
      }

      uniqueCoinNames.forEach((coinName, index) => {
        const coinFilteredData = filteredData.filter(item =>
          this.type === "Crypto" ? item.name === coinName : item.targetCurrency === coinName
        );

        const coinData = sortedLabels.map(label => {
          const matchingItem = coinFilteredData.find(item => this.formatTimestamp(item.timestamp, true) === label);
          return matchingItem ? (matchingItem.valueCAD ?? matchingItem.value ?? matchingItem.rate) : null;
        });

        const colorIndex = index % colorPalette.length;
        const baseColor = index === 0 ? (this.darkMode ? this.getCSSVariableValue("--main-link-color") : this.getCSSVariableValue("--third-font-color")) : colorPalette[colorIndex];

        const datasetConfig: any = {
          data: coinData,
          label: `${coinName} Fluctuation ${this.type === "Crypto" && this.selectedCurrency ? `(${this.selectedCurrency}$)` : ""}`,
          backgroundColor: this.hexToRgba(baseColor, 0.2),
          borderColor: baseColor,
          borderWidth: 2,
          borderJoinStyle: "round",
          tension: 0.2,
          cubicInterpolationMode: 'monotone',
          pointBackgroundColor: index === 0 ? (this.darkMode ? this.getCSSVariableValue("--main-font-color") : this.getCSSVariableValue("--main-highlight-color")) : '#ffffff',
          pointBorderColor: baseColor,
          pointRadius: 3,
          pointHoverRadius: 5,
          spanGaps: true
        };

        if (this.isDotModeData1) {
          datasetConfig.showLine = false;
          datasetConfig.pointRadius = 10;
          datasetConfig.pointHoverRadius = 7;
          datasetConfig.borderWidth = 0;
        }

        datasets.push(datasetConfig);
      });
    }

    if (hasValidSecondaryData) {
      this.currentSecondaryData = sortedLabels.map(label => {
        const matchingTrade = filteredData2.find(item => this.formatTimestamp(item.timestamp, true) === label); 
        if (matchingTrade) {
          const precision = (matchingTrade.tradeValueCAD ?? null) < 1 ? 8 : 2;
          const tradeValue = matchingTrade.tradeValueCAD.toFixed(precision) + (this.selectedCurrencyDisplay ?? '$');
          return {
            priceCAD: matchingTrade.priceCAD ?? null,
            tradeValueCAD: tradeValue,
            type: matchingTrade.type ?? 'grey'
          };
        }
        return { priceCAD: null, tradeValueCAD: null, type: 'grey' };
      });

      const secondaryConfig: any = {
        type: this.isDotModeData2 ? 'line' : this.chartTypeInputtedData2 ?? 'line',
        label: this.secondaryDataLabel,
        data: this.currentSecondaryData.map(d => d.priceCAD),
        backgroundColor: this.currentSecondaryData.map(d => {
          if (d.type.includes('buy_DCA')) return 'green';
          if (d.type.includes('sell_DCA')) return '#ff0000';
          if (d.type.includes('buy_IND')) return '#0000ff';
          if (d.type.includes('sell_IND')) return '#ff00ff';
          return 'grey';
        }),
        borderColor: this.currentSecondaryData.map(d => {
          if (d.type.includes('buy_DCA')) return 'green';
          if (d.type.includes('sell_DCA')) return '#ff0000';
          if (d.type.includes('buy_IND')) return '#0000ff';
          if (d.type.includes('sell_IND')) return '#ff00ff';
          return 'grey';
        }),
        pointBackgroundColor: this.currentSecondaryData.map(d => {
          if (d.type.includes('buy_DCA')) return 'green';
          if (d.type.includes('sell_DCA')) return '#ff0000';
          if (d.type.includes('buy_IND')) return '#0000ff';
          if (d.type.includes('sell_IND')) return '#ff00ff';
          return 'grey';
        }),
        pointBorderColor: this.currentSecondaryData.map(d => {
          if (d.type.includes('buy_DCA')) return 'green';
          if (d.type.includes('sell_DCA')) return '#ff0000';
          if (d.type.includes('buy_IND')) return '#0000ff';
          if (d.type.includes('sell_IND')) return '#ff00ff';
          return 'grey';
        }),
        borderWidth: 2,
        order: 1,
        spanGaps: true,
        showLine: this.isDotModeData2 ? false : true,
        pointRadius: this.isDotModeData2 ? 10 : 5,
        pointHoverRadius: this.isDotModeData2 ? 12 : 7
      };

      datasets.push(secondaryConfig);
    }

    this.lineChartData = datasets;
    this.lineChartLabels = sortedLabels;
    this.updateChartWithAverage();

    setTimeout(() => {
      this.chart?.chart?.update('none');
    });
  }

  private filterDataBySliderRange(data: any[]): any[] {
    const minTime = this.sliderMinValue;
    const maxTime = this.sliderMaxValue;
    return data.filter(item => {
      const itemTime = new Date(item.timestamp).getTime();
      return itemTime >= minTime && itemTime <= maxTime;
    });
  }

  private formatTimestamp(timestamp: string, omitSeconds = false): string {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      console.warn(`Invalid timestamp: ${timestamp}`);
      return '';
    }
    return `${date.getFullYear()}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}${(!omitSeconds ? ':' + date.getSeconds().toString().padStart(2, '0') : '')}`;
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
    const sortedData = [...this.data].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    if (sortedData.length === 0) return [];

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

    if (periodValue < 1) {
      if (periodValue < 1 / 24) {
        const minutes = periodValue * 24 * 60;
        cutoffDate.setTime(currentUTC.getTime() - minutes * 60000);
      } else {
        const hours = periodValue * 24;
        cutoffDate.setTime(currentUTC.getTime() - hours * 3600000);
      }
    } else {
      cutoffDate.setUTCDate(currentUTC.getUTCDate() - Math.round(periodValue));
    }

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

    if (this.type === "Crypto" || this.type === "MACD") {
      return this.data.filter(item =>
        item.name === coinName &&
        new Date(item.timestamp) >= cutoffDate
      );
    } else if (this.type === "Currency") {
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

    if (period.toLowerCase().includes("max")) {
      return 10 * 365;
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
        if (dataset.label === 'Histogram') return; // Skip histogram for average
        const numericData = dataset.data.map(Number).filter((val: any) => !isNaN(val));
        totalSum += numericData.reduce((sum: number, value: number) => sum + value, 0);
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
        yAxisID: this.type === 'MACD' ? 'y1' : 'y',
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
    this.canvasDiv.nativeElement.style.backgroundColor = this.darkMode
      ? this.getCSSVariableValue("--secondary-component-background-color") ?? '#000000'
      : this.getCSSVariableValue("--component-background-color") ?? '#ffffff';
    setTimeout(() => {
      this.chart?.chart?.update();
      this.updateGraph(this.data);
    }, 50);
  }

  getChartOptions(): any {
    const fontColor = this.getCSSVariableValue("--main-font-color") ??
      (this.darkMode ? '#ffffff' : '#000000');
    const backgroundColor = this.coinSwitcher?.nativeElement?.value ?
      (this.darkMode ? this.getCSSVariableValue("--secondary-font-color") ?? '#ffffff' :
        this.getCSSVariableValue("--third-font-color") ?? '#000000') : undefined;

    const needsLogScale = this.lineChartData.some(dataset =>
      dataset.data.some((value: number) => value !== null && Math.abs(value) < 0.001)
    );

    const options: any = {
      responsive: true,
      maintainAspectRatio: false,
      backgroundColor,
      scales: {
        x: {
          type: 'category',
          time: { unit: this.getTimeUnit(this.selectedPeriod) },
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
          type: needsLogScale ? 'logarithmic' : 'linear',
          ticks: {
            color: fontColor,
            callback: (value: number) => {
              if (needsLogScale || Math.abs(value) < 0.01) {
                if (Math.abs(value) < 0.000001) {
                  return value.toExponential(2);
                }
                if (Math.abs(value) < 0.001) {
                  return value.toFixed(8).replace(/\.?0+$/, '');
                }
                return value.toFixed(6).replace(/\.?0+$/, '');
              }
              if (Math.abs(value) >= 1000) {
                return value.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                  minimumFractionDigits: 2
                });
              }
              return value.toFixed(2);
            }
          },
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
          displayColors: true,
          callbacks: {
            label: (context: any) => {
              let label = context.dataset.label || '';
              if (label === this.secondaryDataLabel && context.dataIndex < this.currentSecondaryData.length) {
                const dataPoint = this.currentSecondaryData[context.dataIndex];
                if (dataPoint.priceCAD !== null && dataPoint.tradeValueCAD !== null) {
                  const action = dataPoint.type.includes('buy') ? 'Buy' : 'Sell';
                  const strategy = dataPoint.type.includes('DCA') ? 'DCA' : 'IND';
                  const price = dataPoint.priceCAD.toFixed(2);
                  const tradeValue = dataPoint.tradeValueCAD;
                  label = `${action} (${strategy}): Price ${price}, Value ${tradeValue}`;
                }
              } else if (label) {
                label += ': ' + context.parsed.y.toFixed(2);
              }
              return label;
            }
          }
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
          tension: 0.2
        }
      }
    };

    if (this.type === "MACD") {
      options.scales.y1 = {
        type: 'linear',
        position: 'right',
        title: { display: true, text: 'Price (USD)', color: fontColor },
        grid: { display: false },
        ticks: {
          color: fontColor,
          callback: (value: number) => value.toFixed(2)
        }
      };
      options.scales.y = {
        type: 'linear',
        position: 'left',
        title: { display: true, text: 'MACD/Signal', color: fontColor },
        grid: { color: fontColor, borderDash: [3, 3] },
        ticks: {
          color: fontColor,
          callback: (value: number) => value.toFixed(2)
        }
      };
    }

    return options;
  }

  private getTimeUnit(period: string): string {
    switch (period) {
      case '5min':
      case '15min':
        return 'minute';
      case '1h':
      case '6h':
      case '12h':
        return 'hour';
      case '1d':
      case '2d':
      case '5d':
        return 'day';
      case '1w':
      case '2w':
      case '3w':
        return 'week';
      case '1m':
      case '2m':
      case '3m':
      case '6m':
        return 'month';
      case '1y':
      case '2y':
      case '3y':
      case '5y':
        return 'year';
      default:
        return 'day';
    }
  }

  getCSSVariableValue(variableName: string) {
    const styles = getComputedStyle(document.documentElement);
    return styles.getPropertyValue(variableName).trim() ?? undefined;
  }

  getGraphTitle(): string {
    if (this.type === 'Volume') {
      return this.selectedPeriod ? `Volume (${this.formatPeriodDisplay()})` : 'Volume';
    }
    if (this.type === 'MACD') {
      return this.selectedPeriod ? `MACD (${this.selectedCoin} • ${this.formatPeriodDisplay()})` : `MACD (${this.selectedCoin})`;
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
    let filteredData = [];
    if (this.type === "Volume" || this.type === "MACD") {
      filteredData = this.filterDataByPeriod(this.getDaysForPeriod(this.selectedPeriod));
    } else if (this.selectedCoin !== '') {
      filteredData = this.filterDataByPeriodAndCoin(this.selectedPeriod, this.selectedCoin);
    } else {
      filteredData = this.filterDataByPeriod(this.getDaysForPeriod(this.selectedPeriod));
    }
    filteredData = this.filterDataBySliderRange(filteredData);

    let filteredData2 = [];
    if (this.data2 && this.data2.length > 0) {
      filteredData2 = this.filterDataByPeriodForSecondary(
        this.getDaysForPeriod(this.selectedPeriod),
        this.data2
      );
      filteredData2 = this.filterDataBySliderRange(filteredData2);
    }

    let headers: string[] = [];
    let rows: string[] = [];

    if (this.type === "MACD") {
      headers = ['Timestamp', 'MACD Line', 'Signal Line', 'Histogram', 'Price'];
      rows = filteredData.map((item: MacdDataPoint) => [
        item.timestamp,
        item.macdLine ?? '',
        item.signalLine ?? '',
        item.histogram ?? '',
        item.price ?? ''
      ].map(field => `"${field}"`).join(','));
    } else {
      headers = ['Timestamp', 'Coin', 'Value', 'Currency', 'Secondary Value', 'Secondary Type'];
      rows = filteredData.map(item => {
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
    }

    const csvContent = [headers.join(','), ...rows].join('\n');

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

  showOptions() {
    this.isShowingOptions = !this.isShowingOptions;
  }

  scrollToGraph(): void {
    if (this.canvasDiv) {
      this.canvasDiv.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      console.warn('canvasDiv is not available');
    }
  }
}