import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-menu-item',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app-menu-item.component.html',
  styleUrls: ['./app-menu-item.component.css']
})
export class AppMenuItemComponent {
  @Input() type: string = '';
  @Input() parentRef: any;
  @Input() label?: string;
  @Input() className?: string;

  open() {
    if (this.parentRef.getMenuItemDescription(this.type)) {
      if (this.parentRef && typeof this.parentRef.createComponent === 'function') {
        this.parentRef.createComponent(this.type);
      }
    } else {
      this.parentRef.showNotification("Unknown component type");
    }
  }

  get displayLabel() {
    return this.label ?? this.type;
  }
}
