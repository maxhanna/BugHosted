import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-menu-item',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app-menu-item.component.html',
  styleUrl: './app-menu-item.component.css'
})
export class AppMenuItemComponent {
  @Input() type: string = '';
  @Input() parentRef: any;
  @Input() label?: string;
  @Input() className?: string;

  private readonly EXCLUDED_TYPES = new Set<string>([
    'reactions', 
  ]);

  open() {
    if (!this.isExcluded(this.type) && this.parentRef.getMenuItemDescription(this.type)) {
      this.parentRef.createComponent(this.type); 
    } else {
      this.parentRef.showNotification("Unknown component type");
    }
  }

  get displayLabel() {
    return this.label ?? this.type;
  }

  // Return true when the label (or fallback type) ends with a colon
  labelEndsWithColon(): boolean {
    const s = this.displayLabel;
    return !!s && s.trim().endsWith(':');
  }

  // Return the label with the parent's icon inserted immediately before the trailing colon.
  // Example: label "Search:" with icon "🔍" -> "Search 🔍:"
  renderedLabelWithIcon(): string {
    const s = this.displayLabel ?? '';
    if (!this.labelEndsWithColon()) return s;
    const icon = this.parentRef?.getIconByTitle(this.type) ?? '';
    const base = s.trim().slice(0, -1); // remove trailing ':'
    return icon ? `${base}${icon}:` : `${base}:`;
  }
  
  private normalize(s?: string): string {
    return (s ?? '').trim().toLowerCase();
  }

  private isExcluded(type: string): boolean {
    return this.EXCLUDED_TYPES.has(this.normalize(type));
  } 
}
