import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'pascalCase'
})
export class PascalCasePipe implements PipeTransform {
  transform(value: unknown): string {
    if (value === null || value === undefined) return '';
    const s = String(value).trim();
    if (s.length === 0) return '';
    // Split on non-alphanumeric characters and whitespace
    const parts = s.split(/[^A-Za-z0-9]+/).filter(p => p.length > 0);
    const transformed = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
    return transformed;
  }
}
