import { Component, ElementRef, ViewChild } from '@angular/core';
import { AppComponent } from '../app.component';

@Component({
  selector: 'app-navigation',
  templateUrl: './navigation.component.html',
  styleUrl: './navigation.component.css'
})
export class NavigationComponent {
  @ViewChild('navbar') navbar!: ElementRef<HTMLElement>;
  titles = new Map([
    ["📅", "Calendar"],
    ["📈", "Coin-Watch"],
    ["F", "Favourites"],
    ["☀️", "Weather"],
    ["⛏️", "Mining"],
    ["📁", "Files"]
  ]);

  constructor(private _parent: AppComponent) {
  }

  toggleMenu() {
    this.navbar.nativeElement.classList.toggle("isOpen");
  }
  goTo(event: any) {
    this._parent.createComponent(event.target.getAttribute('title'));
    event.stopPropagation();
  }
}
