// Add this pipe for time formatting (create a new file)
import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'timeFormat'
})
export class TimeFormatPipe implements PipeTransform {
  transform(seconds: number, format: 'full' | 'minify' = 'full'): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    const parts: string[] = [];

    if (format === 'minify') {
      if (h) parts.push(`${h}h`);
      if (m) parts.push(`${m}m`);
      if (s || (!h && !m)) parts.push(`${s}s`);
    } else {
      if (h) parts.push(`${h} hour${h !== 1 ? 's' : ''}`);
      if (m) parts.push(`${m} minute${m !== 1 ? 's' : ''}`);
      if (s || (!h && !m)) parts.push(`${s} second${s !== 1 ? 's' : ''}`);
    }
    return parts.join(' ');
  }
}