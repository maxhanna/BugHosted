import { Component, ElementRef, ViewChild } from '@angular/core';
import { AppComponent } from '../app.component';
import { HttpClient } from '@angular/common/http';
import { WeatherResponse } from '../weather-response';

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

  constructor(private _parent: AppComponent, private http: HttpClient) {
    this.getCurrentWeatherIcon();
  }
  async getCurrentWeatherIcon() {
    const res = await this.http.get<WeatherResponse>('/weatherforecast').toPromise();
    this.titles.set(res?.current.condition.icon!, "Weather");
  }
  toggleMenu() {
    console.log(window.document.body.style.paddingBottom);
    this.navbar.nativeElement.classList.toggle('collapsed');
    
    const currText = this.toggleNavButton.nativeElement.innerText;
    this.toggleNavButton.nativeElement.innerText = currText != "📖" ? "📖" : "📕";
    this.toggleNavButton.nativeElement.title = currText != "📖" ? "Open Navigation" : "Close Navigation";
    window.document.body.style.paddingBottom = currText != "📖" ? "0px" : "50px";
  }
  goTo(event: any) {
    this._parent.createComponent(event.target.getAttribute('title'));
    event.stopPropagation();
  }
}
