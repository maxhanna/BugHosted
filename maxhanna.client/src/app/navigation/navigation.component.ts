import { Component, ElementRef, ViewChild } from '@angular/core';
import { AppComponent } from '../app.component';

@Component({
  selector: 'app-navigation',
  templateUrl: './navigation.component.html',
  styleUrl: './navigation.component.css'
})
export class NavigationComponent {
  @ViewChild('navbar') navbar!: ElementRef<HTMLElement>;
  @ViewChild('toggleNavButton') toggleNavButton!: ElementRef<HTMLElement>;
  titles = new Map([
    ["📅", "Calendar"],
    ["₿", "Coin-Watch"],
    ["🔍", "Favourites"],
    ["☀️", "Weather"],
    ["⛏️", "MiningDevices"],
    ["🖥️", "MiningRigs"],
    ["📁", "Files"],
    ["✔️", "Todo"],
    ["▶️", "Music"],
    ["🗒️", "Notepad"],
    ["📇", "Contacts"],
    ["🎮", "Game"],
    ["🕹️", "Gbc"],
    ["💵", "Coin-Wallet"],
  ]);

  constructor(private _parent: AppComponent) {
  }

  toggleMenu() {
    this.navbar.nativeElement.classList.toggle('collapsed');

    const elements = document.getElementsByClassName("componentMain");
    Array.from(elements).forEach(x => x.classList.toggle('collapsedComponent'));

    const currText = this.toggleNavButton.nativeElement.innerText;
    this.toggleNavButton.nativeElement.innerText = currText != "📖" ? "📖" : "📕";
    this.toggleNavButton.nativeElement.title = currText != "📖" ? "Open Navigation" : "Close Navigation";
  }
  goTo(event: any) {
    this._parent.createComponent(event.target.getAttribute('title'));
    event.stopPropagation();
  }
}
