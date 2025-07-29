import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'currencySymbol',
  standalone: true
})
export class CurrencySymbolPipe implements PipeTransform {
  transform(
    value: number | string | null | undefined, // Make value optional
    currencyCode: string = 'USD',
    showFull?: boolean
  ): string {
    const symbol = this.getCurrencySymbol(currencyCode);

    // If value is null/undefined, return ONLY the symbol
    if (value === null || value === undefined) {
      return symbol;
    }

    // Convert string to number if necessary, preserving precision
    const numericValue = typeof value === 'string' ? parseFloat(value) : value;

    // Handle invalid numbers
    if (isNaN(numericValue)) {
      console.warn(`CurrencySymbolPipe: Invalid number for value=${value}, currencyCode=${currencyCode}`);
      return `${symbol}0`;
    } 
    
    // Logic for showFull
    if (showFull) {
      const formatted = numericValue.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 12 // Increased for small values
      }); 
      return `${symbol}${formatted}`;
    }

    const trillion = 1_000_000_000_000;
    const billion = 1_000_000_000;
    const million = 1_000_000;
    const one = 1;
    const penny = 0.01;

    let formattedValue: string;

    // Handle large values (>= 1 million)
    if (numericValue >= trillion) {
      formattedValue = (numericValue / trillion).toFixed(3) + 'T';
    } else if (numericValue >= billion) {
      formattedValue = (numericValue / billion).toFixed(3) + 'B';
    } else if (numericValue >= million) {
      formattedValue = (numericValue / million).toFixed(3) + 'M';
    }
    // Handle values >= 1 and < 1 million
    else if (numericValue >= one) {
      formattedValue = numericValue.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2 // Limit to 2 decimals for values >= 1
      });
    }
    // Handle fractional penny values (< 0.01)
    else if (numericValue > 0 && numericValue < penny) {
      // Use toFixed(12) for high precision, trim trailing zeros and leading "0."
      formattedValue = numericValue.toFixed(12).replace(/^0\./, '.').replace(/0+$/, '');
      formattedValue = `0${formattedValue}`; // Ensure leading "0." for readability
    }
    // Handle values >= 0.01 and < 1
    else {
      formattedValue = numericValue.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 8 // Higher precision for fractional values
      });
    }
 
    return `${symbol}${formattedValue}`;
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