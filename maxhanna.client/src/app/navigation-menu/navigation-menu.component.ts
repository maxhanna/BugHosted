import { Component, Input } from '@angular/core';
import { AppComponent } from '../app.component';

@Component({
  selector: 'app-navigation-menu',
  templateUrl: './navigation-menu.component.html',
  styleUrls: ['./navigation-menu.component.css'],
  standalone: false
})
export class NavigationMenuComponent {
  @Input() user?: any;
  // collapsed state for the left menu
  collapsed: boolean = false;

  constructor(public _parent: AppComponent) {}

  goTo(title: string, event?: any) {
    try {
      if (title === 'UpdateUserSettings') {
        this._parent.createComponent(title, { inputtedParentRef: this._parent, areSelectableMenuItemsExplained: true, showOnlySelectableMenuItems: true });
      } else if (title.toLowerCase() !== 'help') {
        this._parent.createComponent(title);
      } else {
        this._parent.createComponent(title);
      }
    } catch (e) {
      console.error('NavigationMenu goTo error', e);
    }
    event?.stopPropagation();
  }

  parseNumber(notifNumbers?: string) {
    if (!notifNumbers || notifNumbers.trim() === '') return 0;
    return parseInt(notifNumbers, 10) || 0;
  }

  menuIconsIncludes(title: string) {
    return this._parent.userSelectedNavigationItems?.some((x: any) => x.title == title);
  }

  toggleCollapse() {
    this.collapsed = !this.collapsed;
  }
}
