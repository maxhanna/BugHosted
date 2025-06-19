import { Pipe, PipeTransform } from "@angular/core";

@Pipe({
  name: 'timeSince',
  pure: false
})
export class TimeSincePipe implements PipeTransform {
  transform(date?: Date | string, granularity: 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second' = 'minute'): string {
    if (!date) return "0";

    const dateObj = this.parseDate(date);
    if (!dateObj || isNaN(dateObj.getTime())) return "0";

    return this.calculateTimeSince(dateObj, granularity);
  }

  private parseDate(date: Date | string): Date {
    if (date instanceof Date) return date;

    // Handle ISO strings (with or without 'Z') and other formats
    if (typeof date === 'string') {
      // If it's already in ISO format with timezone info
      if (date.includes('Z') || date.includes('+')) {
        return new Date(date);
      }
      // If it's in ISO format without timezone, treat as UTC
      if (date.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)) {
        return new Date(date + 'Z');
      }
      // Try parsing as is
      return new Date(date);
    }

    return new Date(NaN); // Invalid date
  }

  private calculateTimeSince(date: Date, granularity?: 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second'): string {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 0) return "0"; // Future date

    // Calculate all time units
    const years = Math.floor(diffInSeconds / (60 * 60 * 24 * 365));
    const months = Math.floor(diffInSeconds / (60 * 60 * 24 * 30)) % 12;
    const days = Math.floor(diffInSeconds / (60 * 60 * 24)) % 30;
    const hours = Math.floor(diffInSeconds / (60 * 60)) % 24;
    const minutes = Math.floor(diffInSeconds / 60) % 60;
    const seconds = diffInSeconds % 60;

    // Build the result string
    const parts: string[] = [];

    if (years > 0) parts.push(`${years}y`);
    if (granularity === 'year') return parts.join(' ') || '0y';

    if (months > 0) parts.push(`${months}m`);
    if (granularity === 'month') return parts.join(' ') || '0m';

    if (days > 0) parts.push(`${days}d`);
    if (granularity === 'day') return parts.join(' ') || '0d';

    if (hours > 0) parts.push(`${hours}h`);
    if (granularity === 'hour') return parts.join(' ') || '0h';

    if (minutes > 0) parts.push(`${minutes}m`);
    if (granularity === 'minute') return parts.join(' ') || '0m';

    if (seconds > 0) parts.push(`${seconds}s`);

    return parts.join(' ') || '0s';
  }
}