import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'currencyFlag'
})
export class CurrencyFlagPipe implements PipeTransform {
  transform(currencyCode: string): string {
    if (!currencyCode) return '';

    // Convert currency code to uppercase and generate flag emoji
    return this.getFlagEmoji(currencyCode);
  }

  private getFlagEmoji(currencyCode: string): string {
    const currencyToCountryMap: { [key: string]: string } = {
      'USD': 'US', 'CAD': 'CA', 'EUR': 'EU', 'GBP': 'GB', 'AUD': 'AU',
      'JPY': 'JP', 'CNY': 'CN', 'INR': 'IN', 'BRL': 'BR', 'MXN': 'MX'
    };

    const countryCode = currencyToCountryMap[currencyCode.toUpperCase()];
    if (!countryCode) return ''; // Return empty if no match found

    return countryCode
      .toUpperCase()
      .split('')
      .map(char => String.fromCodePoint(0x1F1E6 - 65 + char.charCodeAt(0)))
      .join('');
  }
}
