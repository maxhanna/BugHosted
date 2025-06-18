// market-cap-shorten.pipe.ts
import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'currencyShorten',
  standalone: false
})
export class CurrencyShortenPipe implements PipeTransform {
  transform(value: number, showLess?: boolean): string {
    if (showLess != undefined && showLess == true) {
      return '$' + value.toLocaleString();
    }

    // For mobile, shorten the display
    const trillion = 1000000000000;
    const billion = 1000000000;
    const million = 1000000;

    if (value >= trillion) {
      return '$' + (value / trillion).toFixed(3) + 'T';
    } else if (value >= billion) {
      return '$' + (value / billion).toFixed(3) + 'B';
    } else if (value >= million) {
      return '$' + (value / million).toFixed(3) + 'M';
    } else {
      return '$' + value.toLocaleString();
    }
  }
}