import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { AppComponent } from '../app.component';

@Component({
  selector: 'app-title-bar',
  templateUrl: './title-bar.component.html',
  styleUrls: ['./title-bar.component.css'],
  standalone: false
})
export class TitleBarComponent implements OnInit, OnChanges {
  @Input() inputtedParentRef: AppComponent | undefined;
  @Input() title: string | undefined;
  @Input() showTitle: boolean = true;
  @Input() hasNotifications: boolean = false;
  @Input() showNotifications?: boolean;
  @Input() hasSearch: boolean = false;
  @Input() showSearch?: boolean;
  @Input() hasClose: boolean = true;
  @Input() showClose?: boolean;
  @Input() hasMenu: boolean = true;
  @Input() showMenu?: boolean;
  @Input() hasBack: boolean = false;
  @Input() showBack?: boolean;
  @Input() hasHelp: boolean = false;
  @Input() showHelp?: boolean;
  @Input() hasRefresh: boolean = false;
  @Input() showRefresh?: boolean;
  @Input() previousComponent: string | undefined;
  @Output() closeClicked = new EventEmitter<void>();
  @Output() menuClicked = new EventEmitter<void>();
  @Output() helpClicked = new EventEmitter<void>();
  @Output() searchClicked = new EventEmitter<void>();
  @Output() refreshClicked = new EventEmitter<void>();
  @Output() backClicked = new EventEmitter<void>();

  numberOfItems = 1 as 0 | 1 | 2 | 3 | 4 | 5;
  classes = "";
  fullyLoaded = false;

  ngOnInit(): void {
    this.initialize();
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.initialize();
  }

  private initialize(): void {
    this.hasMenu = this.isShowMenuBound;
    this.hasClose = this.isCloseButtonBound;
    this.hasHelp = this.isShowHelpBound;
    this.hasBack = this.isBackButtonBound;
    this.hasSearch = this.isShowSearchBound;
    this.hasRefresh = this.isRefreshBound;
    if (!this.inputtedParentRef && this.hasNotifications) {
      this.hasNotifications = false;
    }
    this.fullyLoaded = true;
    if ((this.showMenu === undefined) && this.hasMenu) {
      this.showMenu = true;
    }
    if ((this.showClose === undefined) && this.hasClose) {
      this.showClose = true;
    }
    if ((this.showHelp === undefined) && this.hasHelp) {
      this.showHelp = true;
    }

    if ((this.showBack === undefined) && this.hasBack && this.previousComponent) {
      this.showBack = true;
    }
    if (this.hasBack && !this.previousComponent) {
      this.showBack = false;
    } 
    if ((this.showSearch === undefined) && this.hasSearch) {
      this.showSearch = true;
    }
    if ((this.showRefresh === undefined) && this.hasRefresh) {
      this.showRefresh = true;
    }
    if ((this.showNotifications === undefined) && this.hasNotifications) {
      this.showNotifications = true;
    }
    // reset cached classes so titleSpanClass recalculates
    this.classes = "";
  }

  get isShowMenuBound(): boolean {
    return (this.menuClicked?.observers?.length ?? 0) > 0;
  }

  get isRefreshBound(): boolean {
    return (this.refreshClicked?.observers?.length ?? 0) > 0;
  }

  get isShowSearchBound(): boolean {
    return (this.searchClicked?.observers?.length ?? 0) > 0;
  }

  get isBackButtonBound(): boolean {
    return (this.backClicked?.observers?.length ?? 0) > 0;
  }

  get isShowHelpBound(): boolean {
    return (this.helpClicked?.observers?.length ?? 0) > 0;
  }

  get isCloseButtonBound(): boolean {
    return (this.closeClicked?.observers?.length ?? 0) > 0;
  }

  get notificationIconSlot() {
    let tmpNumberOfItems = this.numberOfItems;
    if (this.showNotifications) {
      tmpNumberOfItems = Math.max(0, tmpNumberOfItems--) as 0 | 1 | 2 | 3 | 4 | 5;
    }
    if (this.hasBack && (!this.showBack || !this.previousComponent)) {
      tmpNumberOfItems = Math.max(0, tmpNumberOfItems--) as 0 | 1 | 2 | 3 | 4 | 5;
    }
    if (this.hasClose && !this.showClose) {
      tmpNumberOfItems = Math.max(0, tmpNumberOfItems--) as 0 | 1 | 2 | 3 | 4 | 5;
    }
    if (this.hasRefresh && !this.showRefresh) {
      tmpNumberOfItems = Math.max(0, tmpNumberOfItems--) as 0 | 1 | 2 | 3 | 4 | 5;
    }
    if (this.hasMenu && !this.showMenu) {
      tmpNumberOfItems = Math.max(0, tmpNumberOfItems--) as 0 | 1 | 2 | 3 | 4 | 5;
    }
    if (this.hasSearch && !this.showSearch) {
      tmpNumberOfItems = Math.max(0, tmpNumberOfItems--) as 0 | 1 | 2 | 3 | 4 | 5;
    }  
    return tmpNumberOfItems as 0 | 1 | 2 | 3 | 4 | 5;
  }

  get titleSpanClass(): string {
    if (!this.fullyLoaded) {
      return "";
    }
    if (this.classes) {
      return this.classes;
    }
    const classes = ["titleSpan"];
    this.numberOfItems = 0;
    if (this.hasSearch) {
      this.numberOfItems++;
    }
    if (this.hasNotifications) {
      this.numberOfItems++;
    }
    if (this.hasMenu) {
      this.numberOfItems++;
    }
    if (this.hasClose) {
      this.numberOfItems++;
    }
    if (this.hasBack) {
      this.numberOfItems++;
    }
    if (this.hasHelp) {
      this.numberOfItems++;
    }
    classes.push(`sizeOf${this.numberOfItems}`);
    this.classes = classes.join(' ');
    return this.classes;
  }

  get searchRight(): string {
    if (!this.showSearch) return '0px';
    let count = 0;
    // Controls typically rendered on the right side
    if (this.showMenu) count++;
    if (this.showClose) count++;
    if (this.showRefresh) count++;
    if (this.showBack) count++;
    if (this.showHelp) count++;
    const px = (count * 50) + (count * 2);
    return `${px}px`;
  }
}
