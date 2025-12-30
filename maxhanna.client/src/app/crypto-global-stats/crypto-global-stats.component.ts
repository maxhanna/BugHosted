import { Component, Input, OnInit } from '@angular/core'; 
import { ChartOptions, ChartConfiguration } from 'chart.js';
import { TradeService } from '../../services/trade.service'; 
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { CurrencySymbolPipe } from '../currency-symbol';

@Component({
  selector: 'app-crypto-global-stats',
  standalone: true, 
  templateUrl: './crypto-global-stats.component.html',
  styleUrl: './crypto-global-stats.component.css',
  imports: [BaseChartDirective, CommonModule, CurrencySymbolPipe],
})
export class CryptoGlobalStatsComponent implements OnInit {
  constructor(private tradeService: TradeService) { }
  @Input() latestCurrencyPriceRespectToFIAT: number = 0;
  @Input() selectedCurrency: string = "USD";
  @Input() set metrics(value: any) {
    if (value) {
      this._metrics = value; 
      this.updateCharts();
    }
  }
  get metrics(): any {
    return this._metrics;
  }
  private _metrics: any = {};

  // Color variables
  private mainFontColor: string = '#ffffff';
  private secondaryFontColor: string = '#cccccc';
  private componentBgColor: string = '#2d2d2d';

  /* UI state */
  showExtraMetrics = false;
  showDominanceChart = false;
  dominanceTrendBroken = false;   // <-- flag for alert styling

  // Chart configurations
  dominanceChartData?: ChartConfiguration<'pie'>['data'];
  volumeChartData?: ChartConfiguration<'pie'>['data'];
  trendsChartData?: ChartConfiguration<'line'>['data'];

  // === dominance: NEW 30-day line data ===
  dominanceLineChartData?: ChartConfiguration<'line'>['data'];

  chartOptions: ChartOptions<'pie'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const,
        labels: {
          color: this.mainFontColor,
          usePointStyle: true,
          padding: 20
        }
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const label = context.label || '';
            const value = context.raw || 0;
            const formattedValue = this.formatNumber(value);
            const percentage = context.parsed || 0;
            return `${label}: ${formattedValue} (${percentage.toFixed(2)}%)`;
          }
        }
      }
    }
  };

  lineChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: 'category',
        ticks: {
          color: this.mainFontColor,
          maxRotation: 45,
          minRotation: 45
        },
        grid: {
          color: this.secondaryFontColor
        }
      },
      marketCap: {
        type: 'linear',
        position: 'left',
        ticks: {
          color: this.mainFontColor,
          callback: (value: any) => {
            return this.formatNumber(value);
          }
        },
        grid: {
          color: this.secondaryFontColor
        },
        title: {
          display: true,
          text: 'Market Cap',
          color: this.mainFontColor
        }
      },
      volume: {
        type: 'linear',
        position: 'right',
        ticks: {
          color: this.mainFontColor,
          callback: (value: any) => {
            return this.formatNumber(value);
          }
        },
        grid: {
          drawOnChartArea: false
        },
        title: {
          display: true,
          text: '24h Volume',
          color: this.mainFontColor
        }
      }
    },
    plugins: {
      legend: {
        labels: {
          color: this.mainFontColor,
          usePointStyle: true,
          padding: 20
        }
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const label = context.dataset.label || '';
            const value = context.raw || 0;
            return `${label}: ${this.formatNumber(value)}`;
          }
        }
      }
    }
  };

  // === dominance: OPTIONS FOR PERCENTAGE Y-AXIS ===
  dominanceLineChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: 'category',
        ticks: {
          color: this.mainFontColor,
          maxRotation: 45,
          minRotation: 45
        },
        grid: {
          color: this.secondaryFontColor
        }
      },
      y: {
        type: 'linear',
        position: 'left',
        ticks: {
          color: this.mainFontColor,
          callback: (v: any) => v + '%'
        },
        grid: {
          color: this.secondaryFontColor
        },
        title: {
          display: true,
          text: 'Dominance %',
          color: this.mainFontColor
        },
        min: 0,
        max: 100
      }
    },
    plugins: {
      legend: {
        labels: {
          color: this.mainFontColor,
          usePointStyle: true,
          padding: 20
        }
      },
      tooltip: {
        callbacks: {
          label: (ctx: any) => {
            const label = ctx.dataset.label || '';
            return `${label}: ${ctx.parsed.y.toFixed(2)}%`;
          }
        }
      }
    }
  };

  ngOnInit() {
    this.getCssVariables();
  }

  private getCssVariables() {
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const root = document.documentElement;
      const styles = getComputedStyle(root);

      this.mainFontColor =
        styles.getPropertyValue('--main-font-color').trim() ||
        this.mainFontColor;
      this.secondaryFontColor =
        styles.getPropertyValue('--secondary-font-color').trim() ||
        this.secondaryFontColor;
      this.componentBgColor =
        styles.getPropertyValue('--component-background-color').trim() ||
        this.componentBgColor;

      this.updateChartOptions();
    }
  }

  private updateChartOptions() {
    this.chartOptions = {
      ...this.chartOptions,
      plugins: {
        ...this.chartOptions.plugins,
        legend: {
          ...this.chartOptions.plugins?.legend,
          labels: {
            ...this.chartOptions.plugins?.legend?.labels,
            color: this.mainFontColor
          }
        }
      }
    };

    this.lineChartOptions = {
      ...this.lineChartOptions,
      scales: {
        ...this.lineChartOptions.scales,
        x: {
          ...this.lineChartOptions.scales?.['x'],
          ticks: {
            ...this.lineChartOptions.scales?.['x']?.ticks,
            color: this.mainFontColor
          },
          grid: {
            ...this.lineChartOptions.scales?.['x']?.grid,
            color: this.secondaryFontColor
          }
        },
        marketCap: {
          ...this.lineChartOptions.scales?.['marketCap'],
          ticks: {
            ...this.lineChartOptions.scales?.['marketCap']?.ticks,
            color: this.mainFontColor
          },
          grid: {
            ...this.lineChartOptions.scales?.['marketCap']?.grid,
            color: this.secondaryFontColor
          },
          title: {
            ...this.lineChartOptions.scales?.['marketCap']?.title,
            color: this.mainFontColor
          }
        },
        volume: {
          ...this.lineChartOptions.scales?.['volume'],
          ticks: {
            ...this.lineChartOptions.scales?.['volume']?.ticks,
            color: this.mainFontColor
          },
          title: {
            ...this.lineChartOptions.scales?.['volume']?.title,
            color: this.mainFontColor
          }
        }
      },
      plugins: {
        ...this.lineChartOptions.plugins,
        legend: {
          ...this.lineChartOptions.plugins?.legend,
          labels: {
            ...this.lineChartOptions.plugins?.legend?.labels,
            color: this.mainFontColor
          }
        }
      }
    };

    // === dominance: also recolor dominance options ===
    this.dominanceLineChartOptions = {
      ...this.dominanceLineChartOptions,
      scales: {
        ...this.dominanceLineChartOptions.scales,
        x: {
          ...this.dominanceLineChartOptions.scales?.['x'],
          ticks: {
            ...this.dominanceLineChartOptions.scales?.['x']?.ticks,
            color: this.mainFontColor
          },
          grid: {
            ...this.dominanceLineChartOptions.scales?.['x']?.grid,
            color: this.secondaryFontColor
          }
        },
        y: {
          ...this.dominanceLineChartOptions.scales?.['y'],
          ticks: {
            ...this.dominanceLineChartOptions.scales?.['y']?.ticks,
            color: this.mainFontColor
          },
          grid: {
            ...this.dominanceLineChartOptions.scales?.['y']?.grid,
            color: this.secondaryFontColor
          },
          title: {
            ...this.dominanceLineChartOptions.scales?.['y']?.title,
            color: this.mainFontColor
          }
        }
      },
      plugins: {
        ...this.dominanceLineChartOptions.plugins,
        legend: {
          ...this.dominanceLineChartOptions.plugins?.legend,
          labels: {
            ...this.dominanceLineChartOptions.plugins?.legend?.labels,
            color: this.mainFontColor
          }
        }
      }
    };
  }

  private updateCharts() {
    if (
      !this.metrics ||
      !this.metrics.latest ||
      !this.metrics.historical
    ) {
      console.warn('Metrics data is incomplete:', this.metrics);
      return;
    }

    const latest = this.metrics.latest;
    const historical = this.metrics.historical;

    if (
      !latest.btcDominance ||
      !latest.ethDominance ||
      !latest.totalVolume24h ||
      !latest.stablecoinVolume24h ||
      !latest.defiVolume24h ||
      !latest.derivativesVolume24h
    ) {
      console.warn('Latest metrics missing required fields:', latest);
      return;
    }

    // Market Cap Dominance Pie Chart
    this.dominanceChartData = {
      labels: ['Bitcoin', 'Ethereum', 'Altcoins'],
      datasets: [
        {
          data: [
            latest.btcDominance,
            latest.ethDominance,
            100 - latest.btcDominance - latest.ethDominance
          ],
          backgroundColor: ['#F7931A', '#627EEA', '#26A17B'],
          borderColor: this.componentBgColor,
          borderWidth: 1
        }
      ]
    };

    // 24h Volume Distribution Pie Chart
    this.volumeChartData = {
      labels: [
        'Bitcoin',
        'Ethereum',
        'Stablecoins',
        'DeFi',
        'Derivatives'
      ],
      datasets: [
        {
          data: [
            latest.totalVolume24h * (latest.btcDominance / 100),
            latest.totalVolume24h * (latest.ethDominance / 100),
            latest.stablecoinVolume24h,
            latest.defiVolume24h,
            latest.derivativesVolume24h
          ],
          backgroundColor: [
            '#F7931A',
            '#627EEA',
            '#2775CA',
            '#FF6B6B',
            '#9B59B6'
          ],
          borderColor: this.componentBgColor,
          borderWidth: 1
        }
      ]
    };

    // Market Trends Line Chart (7-day)
    if (historical.length > 0) {
      this.trendsChartData = {
        labels: historical.map((item: any) => item.date),
        datasets: [
          {
            label: 'Total Market Cap',
            data: historical.map((item: any) => item.totalMarketCap),
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 2,
            yAxisID: 'marketCap',
            fill: true,
            tension: 0.3
          },
          {
            label: '24h Trading Volume',
            data: historical.map(
              (item: any) => item.totalVolume24h
            ),
            backgroundColor: 'rgba(153, 102, 255, 0.2)',
            borderColor: 'rgba(153, 102, 255, 1)',
            borderWidth: 2,
            yAxisID: 'volume',
            fill: true,
            tension: 0.3
          }
        ]
      };
    } else {
      console.warn('No historical data available for trends chart');
      this.trendsChartData = { labels: [], datasets: [] };
    }

    // === dominance: 30-day dominance line chart ===
    if (this.metrics.dominance && this.metrics.dominance.length > 0) {
      const dom = this.metrics.dominance;
      this.dominanceLineChartData = {
        labels: dom.map((d: DominanceEntry) => d.date),
        datasets: [
          {
            label: 'BTC Dominance',
            data: dom.map((d: DominanceEntry) => d.btcDominance),
            borderColor: '#F7931A',
            backgroundColor: 'rgba(247, 147, 26, 0.2)',
            borderWidth: 2,
            fill: true,
            tension: 0.25,
            pointRadius: 0
          },
          {
            label: 'Altcoin Dominance',
            data: dom.map(
              (d: DominanceEntry) => d.altcoinDominance
            ),
            borderColor: '#26A17B',
            backgroundColor: 'rgba(38, 161, 123, 0.2)',
            borderWidth: 2,
            fill: true,
            tension: 0.25,
            pointRadius: 0
          },
          {
            label: 'Stablecoin Dominance',
            data: dom.map(
              (d: DominanceEntry) => d.stablecoinDominance
            ),
            borderColor: '#2775CA',
            backgroundColor: 'rgba(39, 117, 202, 0.2)',
            borderWidth: 2,
            fill: true,
            tension: 0.25,
            pointRadius: 0
          }
        ]
      };
      const first = dom[0].btcDominance;
      const last = dom[dom.length - 1].btcDominance;
      this.dominanceTrendBroken = Math.abs(last - first) > 1; // >1 pp swing → broken
    } else {
      console.warn('No dominance data available for dominance chart'); 
      this.dominanceLineChartData = { labels: [], datasets: [] };
      this.dominanceTrendBroken = false;
    }
  }
 
  // Replace the existing formatNumber method with this one
  formatNumber(value: number | null | undefined): string {
    return this.tradeService.formatLargeNumber(value || 0).replaceAll("$", "");
  }
  getConvertedCurrencyValueRespectToFiat(value?: number) {
    if (!value) return 0;
    else return parseFloat((value * (this.latestCurrencyPriceRespectToFIAT ?? 1)).toFixed(2));
  }
}

// === dominance: interface stays the same ===
export interface DominanceEntry {
  date: string; // 'YYYY-MM-DD'
  btcDominance: number;
  altcoinDominance: number;
  stablecoinDominance: number;
}
