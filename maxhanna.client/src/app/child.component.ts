import { Component } from '@angular/core';
import { AppComponent } from './app.component';
import { User } from '../services/datacontracts/user/user';

@Component({
    selector: 'app-child-component',
    template: '',
    standalone: false
})
export class ChildComponent {
  public unique_key?: number;
  public parentRef?: AppComponent;
  asc: [string, number][] = [];
  isLoading = false;
  debounceTimer: any;
  filteredEmojis: { [key: string]: string } = { ...this.parentRef?.emojiMap };

  remove_me(componentTitle: string) {
    this.isLoading = false;
    if (this.parentRef && this.unique_key) {
      this.parentRef.removeComponent(this.unique_key);
    } else {
      console.log("key not found: " + componentTitle);
    }
  }

  onMobile() {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }
  getUtcTimeSince(dateString?: Date | string, granularity?: 'year' | 'month' | 'day' | 'hour' | 'minute'): string {
    if (!dateString) return '';
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    let tmpDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);  
     
    return this.daysSinceDate(tmpDate, granularity);
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


  debounce(func: Function, wait: number) {
    let isFirstCall = true;
    let timer: number | undefined;

    return (...args: any[]) => {
      if (isFirstCall) {
        func.apply(this, args);
        isFirstCall = false;
      }
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        func.apply(this, args);
      }, wait);
    };
  } 

  startLoading() {
    if (document && document.getElementById("loadingDiv")) {
      document.getElementById("loadingDiv")!.style.display = "block";
    }
    this.isLoading = true;
  }
  stopLoading() {
    if (document && document.getElementById("loadingDiv")) {
      document.getElementById("loadingDiv")!.style.display = "none";
    }
    this.isLoading = false;
  }

  viewProfile(user?: User) {
    if (user && user.id != 0) {
      this.parentRef?.closeOverlay();
      this.parentRef?.createComponent("User", { "userId": user.id });
    }
  }
  sortTable(columnIndex: number, tableId: string): void {
    const table = document.getElementById(tableId) as HTMLTableElement;
    if (!table) return;

    const rowsArray = Array.from(table.rows).slice(1); // Skip the header row
    const isAscending = this.asc.some(([tbl, col]) => tbl === tableId && col === columnIndex);

    // Regular expression to detect common date formats
    const dateRegex = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/;

    // Custom comparator for sorting
    const compare = (rowA: HTMLTableRowElement, rowB: HTMLTableRowElement) => {
      const cellA = rowA.cells[columnIndex].textContent?.trim() || '';
      const cellB = rowB.cells[columnIndex].textContent?.trim() || '';

      // Check if both values match the date pattern
      const isDateA = dateRegex.test(cellA);
      const isDateB = dateRegex.test(cellB);

      if (isDateA && isDateB) {
        const dateA = new Date(cellA).getTime();
        const dateB = new Date(cellB).getTime();
        return isAscending ? dateA - dateB : dateB - dateA;
      }

      // Check if both values are numbers
      const numA = parseFloat(cellA);
      const numB = parseFloat(cellB);
      const isNumA = !isNaN(numA) && cellA === numA.toString();
      const isNumB = !isNaN(numB) && cellB === numB.toString();

      if (isNumA && isNumB) {
        return isAscending ? numA - numB : numB - numA;
      }

      // Default to string comparison
      return isAscending ? cellA.localeCompare(cellB) : cellB.localeCompare(cellA);
    };

    // Sort rows in memory
    rowsArray.sort(compare);

    // Rebuild the table using a DocumentFragment
    const fragment = document.createDocumentFragment();
    rowsArray.forEach(row => fragment.appendChild(row));

    // Append sorted rows back to the table
    table.tBodies[0].appendChild(fragment);

    // Update sort direction tracking
    if (isAscending) {
      this.asc = this.asc.filter(([tbl, col]) => !(tbl === tableId && col === columnIndex));
    } else {
      this.asc.push([tableId, columnIndex]);
    }
  }


  isElementInViewport(el: HTMLElement): boolean {
    const rect = el?.getBoundingClientRect(); 
    return (
      rect?.top >= 0 &&
      rect?.left >= 0 &&
      rect?.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect?.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  }

  searchForEmoji(event?: any): void {
    if (!this.parentRef) return;
    const searchTerm = event ? event.target.value.toLowerCase() : '';

    // If there's a search term, filter the emojiMap by key or value
    if (searchTerm) {
      this.filteredEmojis = Object.entries(this.parentRef.emojiMap).reduce<{ [key: string]: string }>((result, [key, value]) => {
        if (key.toLowerCase().includes(searchTerm) || value.includes(searchTerm)) {
          result[key] = value;
        }
        return result;
      }, {});
    } else {
      // If there's no search term, show all emojis
      this.filteredEmojis = { ...this.parentRef.emojiMap };
    }
  }


  log(text: any) {
    console.log(text);
  }
}
