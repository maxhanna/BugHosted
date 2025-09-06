import { Pipe, PipeTransform } from "@angular/core";

@Pipe({
  name: 'clickableUrls',
  standalone: false
})
export class ClickableUrlsPipe implements PipeTransform {
  transform(value?: string): string {
    if (!value) {
      return '';
    } 
    return value.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
  }
}