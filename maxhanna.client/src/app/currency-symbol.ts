import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'currencySymbol',
  standalone: true
})
export class CurrencySymbolPipe implements PipeTransform {
  transform(
    value: number | string | null | undefined,
    currencyCode: string = 'USD',
    showFull?: boolean
  ): string {
    const symbol = this.getCurrencySymbol(currencyCode);

    if (value === null || value === undefined) {
      return symbol;
    }

    const numericValue = typeof value === 'string' ? parseFloat(value) : value;

    if (isNaN(numericValue) || numericValue == 0) { 
      return `${symbol}0.00`;
    }

    // Handle negative values first
    const isNegative = numericValue < 0;
    const absoluteValue = Math.abs(numericValue);

    if (showFull) {
      const formatted = absoluteValue.toFixed(numericValue >= 1 ? 2 : 8);
      return `${isNegative ? '-' : ''}${symbol}${formatted}`;
    }

    const trillion = 1_000_000_000_000;
    const billion = 1_000_000_000;
    const million = 1_000_000;
    const one = 1;
    const penny = 0.01;

    let formattedValue: string;

    if (absoluteValue >= trillion) {
      formattedValue = (absoluteValue / trillion).toFixed(3) + 'T';
    } else if (absoluteValue >= billion) {
      formattedValue = (absoluteValue / billion).toFixed(3) + 'B';
    } else if (absoluteValue >= million) {
      formattedValue = (absoluteValue / million).toFixed(3) + 'M';
    }
    else if (absoluteValue >= one) {
      formattedValue = absoluteValue.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }
    else if (absoluteValue > 0 && absoluteValue < penny) {
      formattedValue = absoluteValue.toFixed(12)
        .replace(/^0\./, '.')
        .replace(/0+$/, '');
      formattedValue = `0${formattedValue}`;
    }
    else {
      formattedValue = absoluteValue.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 8
      });
    }

    return `${isNegative ? '-' : ''}${symbol}${formattedValue}`;
  }

  private getCurrencySymbol(currencyCode: string): string {
    const symbols: Record<string, string> = {
      USD: '$',
      CAD: '$',
      GBP: '£',
      EUR: '€',
      JPY: '¥',
      AUD: '$',
      CNY: '¥',
      INR: '₹'
    };
    return symbols[currencyCode.toUpperCase()] || '$';
  }
}