import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { ChartOptions, ChartConfiguration } from 'chart.js';

@Component({
  selector: 'app-crypto-global-stats',
  standalone: true,
  imports: [BaseChartDirective, CommonModule],
  templateUrl: './crypto-global-stats.component.html',
  styleUrls: ['./crypto-global-stats.component.css']
})
export class CryptoGlobalStatsComponent {
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

  // Chart configurations
  dominanceChartData?: ChartConfiguration<'pie'>['data'];
  volumeChartData?: ChartConfiguration<'pie'>['data'];
  trendsChartData?: ChartConfiguration<'line'>['data'];

  chartOptions: ChartOptions<'pie'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const,
        labels: {
          color: 'var(--main-font-color)',
          usePointStyle: true,
          padding: 20
        }
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const label = context.label || '';
            const value = context.raw || 0;
            const percentage = context.parsed || 0;
            return `${label}: ${value.toLocaleString()} (${percentage.toFixed(2)}%)`;
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
          color: 'var(--main-font-color)',
          maxRotation: 45,
          minRotation: 45
        },
        grid: {
          color: 'var(--secondary-font-color)',
        }
      },
      marketCap: {
        type: 'linear',
        position: 'left',
        ticks: {
          color: 'var(--main-font-color)',
          callback: (value: any) => {
            if (value >= 1e12) return '$' + (value / 1e12).toFixed(1) + 'T';
            if (value >= 1e9) return '$' + (value / 1e9).toFixed(1) + 'B';
            if (value >= 1e6) return '$' + (value / 1e6).toFixed(1) + 'M';
            return '$' + value;
          }
        },
        grid: {
          color: 'var(--secondary-font-color)',
        },
        title: {
          display: true,
          text: 'Market Cap',
          color: 'var(--main-font-color)'
        }
      },
      volume: {
        type: 'linear',
        position: 'right',
        ticks: {
          color: 'var(--main-font-color)',
          callback: (value: any) => {
            if (value >= 1e12) return '$' + (value / 1e12).toFixed(1) + 'T';
            if (value >= 1e9) return '$' + (value / 1e9).toFixed(1) + 'B';
            if (value >= 1e6) return '$' + (value / 1e6).toFixed(1) + 'M';
            return '$' + value;
          }
        },
        grid: {
          drawOnChartArea: false, // Prevent grid lines from overlapping
        },
        title: {
          display: true,
          text: '24h Volume',
          color: 'var(--main-font-color)'
        }
      }
    },
    plugins: {
      legend: {
        labels: {
          color: 'var(--main-font-color)',
          usePointStyle: true,
          padding: 20
        }
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const label = context.dataset.label || '';
            const value = context.raw || 0;
            return `${label}: $${value.toLocaleString()}`;
          }
        }
      }
    }
  };

  private updateCharts() {
    if (!this.metrics || !this.metrics.latest || !this.metrics.historical) {
      console.warn('Metrics data is incomplete:', this.metrics);
      return;
    }

    const latest = this.metrics.latest;
    const historical = this.metrics.historical;

    // Validate latest metrics
    if (!latest.btcDominance || !latest.ethDominance || !latest.totalVolume24h ||
      !latest.stablecoinVolume24h || !latest.defiVolume24h || !latest.derivativesVolume24h) {
      console.warn('Latest metrics missing required fields:', latest);
      return;
    }

    // Market Cap Dominance Pie Chart
    this.dominanceChartData = {
      labels: ['Bitcoin', 'Ethereum', 'Altcoins'],
      datasets: [{
        data: [
          latest.btcDominance,
          latest.ethDominance,
          100 - latest.btcDominance - latest.ethDominance
        ],
        backgroundColor: [
          '#F7931A', // Bitcoin orange
          '#627EEA', // Ethereum blue
          '#26A17B'  // Altcoin green
        ],
        borderColor: 'var(--component-background-color)',
        borderWidth: 1
      }]
    };

    // 24h Volume Distribution Pie Chart
    this.volumeChartData = {
      labels: ['Bitcoin', 'Ethereum', 'Stablecoins', 'DeFi', 'Derivatives'],
      datasets: [{
        data: [
          latest.totalVolume24h * (latest.btcDominance / 100),
          latest.totalVolume24h * (latest.ethDominance / 100),
          latest.stablecoinVolume24h,
          latest.defiVolume24h,
          latest.derivativesVolume24h
        ],
        backgroundColor: [
          '#F7931A', // Bitcoin
          '#627EEA', // Ethereum
          '#2775CA', // Stablecoins (blue)
          '#FF6B6B', // DeFi (red)
          '#9B59B6', // Derivatives (purple) 
        ],
        borderColor: 'var(--component-background-color)',
        borderWidth: 1
      }]
    };

    // Market Trends Line Chart (7-day historical)
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
            tension: 0.3 // Smooth the line
          },
          {
            label: '24h Trading Volume',
            data: historical.map((item: any) => item.totalVolume24h),
            backgroundColor: 'rgba(153, 102, 255, 0.2)',
            borderColor: 'rgba(153, 102, 255, 1)',
            borderWidth: 2,
            yAxisID: 'volume',
            fill: true,
            tension: 0.3 // Smooth the line
          }
        ]
      };
    } else {
      console.warn('No historical data available for trends chart');
      this.trendsChartData = { labels: [], datasets: [] };
    }
  }

  formatNumber(value: number | null | undefined): string {
    if (value == null || isNaN(value)) {
      return 'N/A'; // Fallback for null, undefined, or NaN
    }
    if (value >= 1e12) return (value / 1e12).toFixed(2) + 'T';
    if (value >= 1e9) return (value / 1e9).toFixed(2) + 'B';
    if (value >= 1e6) return (value / 1e6).toFixed(2) + 'M';
    if (value >= 1e3) return (value / 1e3).toFixed(2) + 'K';
    return value.toFixed(2);
  }
}