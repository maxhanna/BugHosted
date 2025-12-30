import { Component, Input, OnInit, SimpleChanges } from '@angular/core';
import { ChildComponent } from '../child.component';
import { CoinValueService } from '../../services/coin-value.service';
import { AppComponent } from '../app.component';

interface BitcoinMonthlyPerformance {
  id: number;
  year: number;
  month: number;
  startPriceUSD: number | null;
  endPriceUSD: number | null;
  startMarketCapUSD: number | null;
  endMarketCapUSD: number | null;
  priceChangePercentage: number | null;
  marketCapChangePercentage: number | null;
  lastUpdated: string;
}

@Component({
  selector: 'app-crypto-bitcoin-performance',
  templateUrl: './crypto-bitcoin-performance.component.html',
  standalone: false,
  styleUrl: './crypto-bitcoin-performance.component.css'
})
export class CryptoBitcoinPerformanceComponent extends ChildComponent implements OnInit {
  performanceData: BitcoinMonthlyPerformance[] = [];
  error = false;
  expanded = false;
  groupedByYear: any[] = [];
  realSelectedCoin = "Bitcoin";

  @Input() inputtedParentRef?: AppComponent;
  @Input() conversionRate?: number = undefined;
  @Input() selectedCurrency: string = "USD";
  @Input() selectedCoin: string = "Bitcoin";
  
  constructor(private coinValueService: CoinValueService) { super(); }

  async ngOnInit() {
    if (!this.conversionRate) {
      this.conversionRate = await this.coinValueService.getCurrencyConversionRate("USD", this.selectedCurrency);
      if (!this.conversionRate) {
        this.conversionRate = 1;
      }
    }

    this.realSelectedCoin = this.selectedCoin;
    this.loadPerformanceData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedCoin'] && !changes['selectedCoin'].firstChange) {
      if (this.selectedCoin == "Bitcoin" || this.selectedCoin == "XRP" 
        || this.selectedCoin == "Solana" || this.selectedCoin == "Dogecoin"
        || this.selectedCoin == "Ethereum")
      this.realSelectedCoin = this.selectedCoin;
      this.loadPerformanceData();
    }
  }

  loadPerformanceData() {
    this.startLoading();
    this.error = false;

    this.coinValueService.getMonthlyBitcoinPerformance(this.realSelectedCoin).then(
      (data: BitcoinMonthlyPerformance[]) => {
        this.performanceData = data;
        this.transformData();
        this.stopLoading();
      }
    );
  }

  getMonthName(month: number): string {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return months[month - 1];
  } 

  formatPercentage(percent: number | null): string {
    if (percent === null) return 'N/A';
    return percent > 0 ? `+${percent.toFixed(2)}%` : `${percent.toFixed(2)}%`;
  }

  getChangeClass(percent: number | null): string {
    if (percent === null) return 'neutral';
    return percent >= 0 ? 'positive' : 'negative';
  }
  closeExpanded() { 
    this.expanded = false;
    this.inputtedParentRef?.closeOverlay(false); 
  }
  toggleExpanded() {
    if (!this.expanded) {
      this.expanded = true;
      this.inputtedParentRef?.showOverlay();
    } else {
      this.expanded = false;
      this.inputtedParentRef?.closeOverlay(false);
    } 
  }
  transformData() {
    // Get all unique years, sorted descending (newest first)
    const years = [...new Set(this.performanceData.map(item => item.year))]
      .sort((a, b) => b - a);

    this.groupedByYear = years.map(year => {
      // Create an array with all 12 months, filling in any missing months
      const monthsData = Array(12).fill(null).map((_, index) => {
        const month = index + 1;
        const foundMonth = this.performanceData.find(item =>
          item.year === year && item.month === month
        );
        return foundMonth || {
          year: year,
          month: month,
          startPriceUSD: null,
          endPriceUSD: null,
          priceChangePercentage: null,
          startMarketCapUSD: null,
          endMarketCapUSD: null,
          marketCapChangePercentage: null
        };
      });

      return {
        year: year,
        months: monthsData
      };
    });
  }
  getMonthData(months: any[], month: number): BitcoinMonthlyPerformance {
    return months.find(m => m.month === month) || {
      id: 0,
      year: 0,
      month: month,
      startPriceUSD: null,
      endPriceUSD: null,
      startMarketCapUSD: null,
      endMarketCapUSD: null,
      priceChangePercentage: null,
      marketCapChangePercentage: null,
      lastUpdated: ''
    };
  }
}