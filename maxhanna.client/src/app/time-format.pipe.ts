// Add this pipe for time formatting (create a new file)
import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'timeFormat'
})
export class TimeFormatPipe implements PipeTransform {
  transform(value: string): string {
    if (!value) return '';
    const timePart = value.split(' ')[1];
    return timePart.substring(0, 5); // Returns "HH:MM" format
  }
}