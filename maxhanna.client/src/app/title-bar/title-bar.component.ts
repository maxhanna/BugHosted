import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

@Component({
  selector: 'app-title-bar',
  templateUrl: './title-bar.component.html',
  styleUrls: ['./title-bar.component.css'],
  standalone: false
})
export class TitleBarComponent implements OnInit {
  @Input() title: string | undefined;
  @Input() hasNotifications: boolean = false;
  @Input() hasSearch: boolean = false; 
  @Input() hasClose: boolean = true;
  @Input() hasMenu: boolean = true;
  @Input() hasBack: boolean = false;
  @Output() closeButtonClicked = new EventEmitter<void>();
  @Output() showMenuClicked = new EventEmitter<void>();

  numberOfItems = 1 as 0 | 1 | 2 | 3 | 4 | 5;
  classes = "";

  ngOnInit(): void { 
  }

  get titleSpanClass(): string {
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
    classes.push(`sizeOf${this.numberOfItems}`);
    this.classes = classes.join(' ');
    return this.classes;
  }
}
