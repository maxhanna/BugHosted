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

    if (isNaN(numericValue) || numericValue === 0) {
      return `${symbol}0.00`;
    }

    // Handle negative values
    const isNegative = numericValue < 0;
    const absoluteValue = Math.abs(numericValue);

    if (showFull) {
      const decimalPlaces = Math.max(2, this.getDecimalPlaces(value));
      const formatted = absoluteValue.toFixed(numericValue >= 1 ? 2 : Math.min(decimalPlaces, 8));
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
    } else if (absoluteValue >= one) {
      formattedValue = absoluteValue.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    } else if (absoluteValue > 0 && absoluteValue < penny) {
      formattedValue = absoluteValue.toFixed(12)
        .replace(/^0\./, '.')
        .replace(/0+$/, '');
      formattedValue = `0${formattedValue}`;
    } else {
      // Use the actual decimal places from the input, cap at 4 for backend consistency
      const decimalPlaces = Math.max(2, this.getDecimalPlaces(value));
      formattedValue = absoluteValue.toLocaleString('en-US', {
        minimumFractionDigits: Math.min(decimalPlaces, 2), // Ensure at least 2 decimals
        maximumFractionDigits: Math.min(decimalPlaces, 4)  // Respect backend's 4-decimal limit
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

  private getDecimalPlaces(value: number | string): number {
    // Convert to string to analyze decimal places
    let valueStr = typeof value === 'number' ? value.toString() : value;

    // Handle scientific notation (e.g., 1e-7)
    if (/e/i.test(valueStr)) {
      valueStr = parseFloat(valueStr).toFixed(12); // Convert scientific notation to fixed decimal
    }

    // Split on decimal point and get the decimal part
    const decimalPart = valueStr.split('.')[1];
    return decimalPart ? decimalPart.length : 0;
  }
}