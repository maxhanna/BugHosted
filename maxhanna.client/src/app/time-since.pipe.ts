import { Pipe, PipeTransform } from "@angular/core";

// time-since.pipe.ts
@Pipe({
  name: 'timeSince',
  pure: false // Important for dynamic updates
})
export class TimeSincePipe implements PipeTransform {
  transform(date?: Date): string {
    if (date) { 
      return this.getUtcTimeSince(date);
    } else return "0";
  }

  private getUtcTimeSince(date: Date): string {
    if (!date) return "";

    // Get the user's local time zone dynamically
    const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Check if the date is already in UTC format, if not, treat it as UTC
    const utcDate = date.toString().includes("Z") ? new Date(date) : new Date(date + "Z");

    const options = {
      timeZone: userTimeZone,  // Use the user's local time zone
      hour12: false,           // 24-hour format
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric'
    } as Intl.DateTimeFormatOptions;

    const tmpDate = utcDate.toLocaleString('en-US', options);  
    return this.daysSinceDate(tmpDate, "minute");

  }
  daysSinceDate(dateString?: Date | string, granularity?: 'year' | 'month' | 'day' | 'hour' | 'minute'): string {
    if (!dateString) return '';

    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    const now = new Date();

    // Calculate differences
    let years = now.getFullYear() - date.getFullYear();
    let months = now.getMonth() - date.getMonth();
    let days = now.getDate() - date.getDate();
    let hours = now.getHours() - date.getHours();
    let minutes = now.getMinutes() - date.getMinutes();
    let seconds = now.getSeconds() - date.getSeconds();

    // Adjust for negative values
    if (seconds < 0) {
      minutes--;
      seconds += 60;
    }
    if (minutes < 0) {
      hours--;
      minutes += 60;
    }
    if (hours < 0) {
      days--;
      hours += 24;
    }
    if (days < 0) {
      months--;
      const daysInLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
      days += daysInLastMonth;
    }
    if (months < 0) {
      years--;
      months += 12;
    }

    // Build the result string dynamically based on granularity
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

    return parts.join(' ');
  }

}