import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'countShorten',
  standalone: false
})
export class CountShortenPipe implements PipeTransform {
  transform(value: any, title?: string): string {
    if (value === null || value === undefined) return '';
    const num = typeof value === 'number' ? value : parseInt(value, 10);
    if (isNaN(num)) return value;

    // Generic shortening: unless explicit context requests full value
    const context = (title || '').toLowerCase();
    if (context === 'raw' || context === 'full') {
      return num.toLocaleString();
    }

    const trillion = 1_000_000_000_000;
    const billion = 1_000_000_000;
    const million = 1_000_000;
    const thousand = 1_000;

    const format = (n: number, suffix: string) => {
      // Keep up to 3 significant decimals but trim trailing zeros
      return (n).toFixed(2).replace(/\.0+$/,'').replace(/(\.[0-9]*[1-9])0+$/,'$1') + suffix;
    };

    if (num >= trillion) return format(num / trillion, 'T');
    if (num >= billion) return format(num / billion, 'B');
    if (num >= million) return format(num / million, 'M');
    if (num >= thousand) return format(num / thousand, 'K');
    return num.toString();
  }
}
