import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { AppComponent } from '../app.component';

@Component({
  selector: 'app-title-bar',
  templateUrl: './title-bar.component.html',
  styleUrls: ['./title-bar.component.css'],
  standalone: false
})
export class TitleBarComponent implements OnInit {
  @Input() inputtedParentRef: AppComponent | undefined;
  @Input() title: string | undefined;
  @Input() showTitle: boolean = true;
  @Input() hasNotifications: boolean = false;
  @Input() hasSearch: boolean = false;
  @Input() showOwnSearch: boolean = false;
  @Input() hasClose: boolean = true;
  @Input() hasMenu: boolean = true;
  @Input() hasBack: boolean = false;
  @Input() hasHelp: boolean = false;
  @Input() hasRefresh: boolean = false;
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
    return Math.max(0, this.numberOfItems - 1) as 0 | 1 | 2 | 3 | 4 | 5;
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
}
