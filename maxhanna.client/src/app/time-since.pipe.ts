
import { Pipe, PipeTransform } from "@angular/core";

type Granularity = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';

@Pipe({
  name: 'timeSince',
  pure: false
})
export class TimeSincePipe implements PipeTransform {
  /**
   * @param date Date or string (ISO).
   * @param granularity Max unit to include in the output. Default 'minute'.
   * @param isUTC If true, ISO strings without TZ are treated as UTC (append 'Z').
   *              If false, they are treated as local time. Default true.
   */
  transform(
    date?: Date | string,
    granularity: Granularity = 'minute',
    isUTC: boolean = false
  ): string {
    if (!date) return "0";

    const dateObj = this.parseDate(date, isUTC);
    if (!dateObj || isNaN(dateObj.getTime())) return "0";

    return this.calculateTimeSince(dateObj, granularity);
  }

  private parseDate(date: Date | string, isUTC: boolean): Date | null {
    if (date instanceof Date) {
      // A JS Date already represents an absolute point in time; no string parsing needed.
      return date;
    }

    if (typeof date === 'string') {
      // Treat sentinel as invalid/missing
      if (date.trim().startsWith('0001-01-01')) return null;

      const trimmed = date.trim();

      // If it already has timezone info, use as-is
      if (/[Zz]|[+\-]\d{2}:\d{2}$/.test(trimmed)) {
        return new Date(trimmed);
      }

      // ISO-like without timezone (e.g., "2026-01-04T13:15:58" or with milliseconds)
      const isoNoTz = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/;
      if (isoNoTz.test(trimmed)) {
        // If isUTC=true, append 'Z' to interpret as UTC; else parse as local
        return isUTC ? new Date(trimmed + 'Z') : new Date(trimmed);
      }

      // Fallback: try native parsing (may be local depending on format)
      return new Date(trimmed);
    }

    return null;
  }

  private calculateTimeSince(date: Date, granularity: Granularity): string {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 0) return "0"; // Future date (or clock skew)

    const years = Math.floor(diffInSeconds / (60 * 60 * 24 * 365));
    const monthsTotal = Math.floor(diffInSeconds / (60 * 60 * 24 * 30)); // simple avg month
    const months = monthsTotal % 12;
    const days = Math.floor(diffInSeconds / (60 * 60 * 24)) % 30;
    const hours = Math.floor(diffInSeconds / (60 * 60)) % 24;
    const minutes = Math.floor(diffInSeconds / 60) % 60;
    const seconds = diffInSeconds % 60;

    const parts: string[] = [];

    if (years > 0) parts.push(`${years}y`);
    if (granularity === 'year') return parts.join(' ') || '0y';

    // Use "mo" to avoid confusion with minutes ("m")
    if (months > 0) parts.push(`${months}mo`);
    if (granularity === 'month') return parts.join(' ') || '0mo';

    if (days > 0) parts.push(`${days}d`);
    if (granularity === 'day') return parts.join(' ') || '0d';

    if (hours > 0) parts.push(`${hours}h`);
    if (granularity === 'hour') return parts.join(' ') || '0h';

    if (minutes > 0) parts.push(`${minutes}m`);
    if (granularity === 'minute') {
      if (parts.length === 0) { 
        return seconds > 0 ? `${seconds}s` : 'Just now';
      }
      return parts.join(' ');
    }

    if (seconds > 0) parts.push(`${seconds}s`);
    return parts.join(' ') || '0s';
  }
}
``
