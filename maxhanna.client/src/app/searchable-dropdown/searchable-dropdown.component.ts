import { Component, ElementRef, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

/**
 * Searchable dropdown: a compact button showing the current selection that
 * opens a list rendered from the `items` Input() datasource via *ngFor, with
 * a search box that filters it live. Emits `selectionChange` when an item is
 * picked.
 *
 * Pure presentational component — it owns no selection state, so the parent
 * passes the current value through `[selected]` and updates it on
 * `(selectionChange)`. Works with any string datasource (crypto coins, fiat
 * currencies, tracks, …).
 */
@Component({
  selector: 'app-searchable-dropdown',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './searchable-dropdown.component.html',
  styleUrl: './searchable-dropdown.component.css'
})
export class SearchableDropdownComponent {
  /** Data source — rendered with *ngFor in the list. */
  @Input() items: string[] = [];
  /** Currently selected value (shown on the button, highlighted in the list). */
  @Input() selected: string = '';
  /** Text shown on the button when nothing is selected. */
  @Input() placeholder: string = 'Select…';
  /** Placeholder for the search box. */
  @Input() searchPlaceholder: string = 'Search…';
  /** Fired with the chosen item whenever the user picks one. */
  @Output() selectionChange = new EventEmitter<string>();

  open = false;
  query = '';
  activeIndex = -1;

  constructor(private elementRef: ElementRef<HTMLElement>) { }

  /** Items filtered by the search query (case-insensitive substring). */
  get filteredItems(): string[] {
    const q = this.query.trim().toLowerCase();
    return q ? this.items.filter(i => i.toLowerCase().includes(q)) : this.items;
  }

  toggle() {
    this.open = !this.open;
    if (this.open) {
      this.query = '';
      const idx = this.items.indexOf(this.selected);
      this.activeIndex = idx >= 0 ? idx : -1;
    }
  }

  select(item: string) {
    this.open = false;
    this.query = '';
    this.activeIndex = -1;
    if (item === this.selected) return;
    this.selectionChange.emit(item);
  }

  onSearchInput() {
    this.activeIndex = this.filteredItems.length > 0 ? 0 : -1;
  }

  onKeydown(event: KeyboardEvent) {
    if (!this.open) return;
    if (event.key === 'Escape') {
      this.open = false;
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const n = this.filteredItems.length;
      if (n > 0) {
        const dir = event.key === 'ArrowDown' ? 1 : -1;
        this.activeIndex = (this.activeIndex + dir + n) % n;
      }
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const item = this.activeIndex >= 0 ? this.filteredItems[this.activeIndex] : undefined;
      if (item) this.select(item);
    }
  }

  /** Close when clicking anywhere outside the component. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.open = false;
    }
  }
}
