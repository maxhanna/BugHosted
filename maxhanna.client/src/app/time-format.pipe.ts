// Add this pipe for time formatting (create a new file)
import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'timeFormat'
})
export class TimeFormatPipe implements PipeTransform {
  transform(seconds: number, format: 'full' | 'minify' = 'full', maxParts: number = 6): string {
    // Handle invalid/edge inputs
    if (seconds == null || isNaN(seconds)) return '';
    if (!isFinite(seconds)) return format === 'minify' ? '∞' : 'infinite';
    if (seconds < 0) seconds = 0;

    // Preserve fractional part for milliseconds
    const wholeSeconds = Math.floor(seconds);
    let remainder = wholeSeconds;
    const fractional = seconds - wholeSeconds;
    const milliseconds = Math.round(fractional * 1000); // 0-999

    // Base unit constants
    const SEC = 1;
    const MIN = 60 * SEC;
    const HOUR = 60 * MIN;
    const DAY = 24 * HOUR;
    const WEEK = 7 * DAY;
    const MONTH = 30 * DAY;      // approximate
    const YEAR = 365 * DAY;      // approximate
    const DECADE = 10 * YEAR;        // approximate
    const CENTURY = 100 * YEAR;      // approximate
    const MILLENNIUM = 1000 * YEAR;  // approximate
    const MILLION_YEAR = 1_000_000 * YEAR; // mega-annum (Ma)
    const BILLION_YEAR = 1_000_000_000 * YEAR; // giga-annum (Ga)

    interface UnitDef { key: string; singular: string; plural: string; abbrev: string; size: number; }
    const units: UnitDef[] = [
      { key: 'billionYear', singular: 'billion year', plural: 'billion years', abbrev: 'By', size: BILLION_YEAR },
      { key: 'millionYear', singular: 'million year', plural: 'million years', abbrev: 'My', size: MILLION_YEAR },
      { key: 'millennium', singular: 'millennium', plural: 'millennia', abbrev: 'ky', size: MILLENNIUM },
      { key: 'century', singular: 'century', plural: 'centuries', abbrev: 'c', size: CENTURY },
      { key: 'decade', singular: 'decade', plural: 'decades', abbrev: 'dec', size: DECADE },
      { key: 'year', singular: 'year', plural: 'years', abbrev: 'y', size: YEAR },
      { key: 'month', singular: 'month', plural: 'months', abbrev: 'mo', size: MONTH },
      { key: 'week', singular: 'week', plural: 'weeks', abbrev: 'w', size: WEEK },
      { key: 'day', singular: 'day', plural: 'days', abbrev: 'd', size: DAY },
      { key: 'hour', singular: 'hour', plural: 'hours', abbrev: 'h', size: HOUR },
      { key: 'minute', singular: 'minute', plural: 'minutes', abbrev: 'm', size: MIN },
      { key: 'second', singular: 'second', plural: 'seconds', abbrev: 's', size: SEC },
    ];

    const parts: string[] = [];

    for (const u of units) {
      if (remainder >= u.size) {
        const count = Math.floor(remainder / u.size);
        remainder -= count * u.size;
        if (format === 'minify') {
          parts.push(`${count}${u.abbrev}`);
        } else {
          parts.push(`${count} ${count === 1 ? u.singular : u.plural}`);
        }
        if (parts.length >= maxParts) break;
      }
    }

    // If we still have room and no larger units captured anything, include zero seconds
    if (parts.length === 0 && remainder === 0 && milliseconds === 0) {
      parts.push(format === 'minify' ? '0s' : '0 seconds');
    } else if (remainder > 0 && parts.length < maxParts) {
      // Include leftover seconds if not already added and there is remainder
      if (format === 'minify') parts.push(`${remainder}s`); else parts.push(`${remainder} second${remainder === 1 ? '' : 's'}`);
    }

    // Milliseconds handling (only if meaningful and we haven't hit maxParts)
    if (milliseconds > 0 && parts.length < maxParts) {
      if (format === 'minify') parts.push(`${milliseconds}ms`);
      else parts.push(`${milliseconds} millisecond${milliseconds === 1 ? '' : 's'}`);
    }

    return parts.join(' ');
  }
}