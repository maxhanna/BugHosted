import { Component, ElementRef, ViewChild } from '@angular/core';
import { AppComponent } from '../app.component';
import { HttpClient } from '@angular/common/http';
import { WeatherResponse } from '../weather-response';
import { ChildComponent } from '../child.component';

@Component({
  selector: 'app-navigation',
  templateUrl: './navigation.component.html',
  styleUrls: ['./navigation.component.css'] // Use styleUrls instead of styleUrl
})
export class NavigationComponent extends ChildComponent {
  @ViewChild('navbar') navbar!: ElementRef<HTMLElement>;
  @ViewChild('toggleNavButton') toggleNavButton!: ElementRef<HTMLElement>;
  navigationItems = [
    { icon: "📕", title: "Close Menu"},
    { icon: "📅", title: "Calendar" },
    { icon: "🔍", title: "Favourites" },
    { icon: "⛏️", title: "MiningDevices" },
    { icon: "🖥️", title: "MiningRigs" },
    { icon: "📁", title: "Files" },
    { icon: "✔️", title: "Todo" },
    { icon: "🎼", title: "Music" },
    { icon: "🗒️", title: "Notepad" },
    { icon: "📇", title: "Contacts" },
    { icon: "🎮", title: "Game" },
    { icon: "🕹️", title: "Gbc" },
    { icon: "💵", title: "Coin-Wallet" },
    { icon: "₿", title: "Coin-Watch" },
  ];


  constructor(private _parent: AppComponent, private http: HttpClient) {
    super();
    this.getCurrentWeatherIcon();
  }

  async getCurrentWeatherIcon() {
    const res = await this.http.get<WeatherResponse>('/weatherforecast').toPromise();
    if (res?.current.condition.icon && res?.current.condition.icon.includes('weatherapi')) {
      this.navigationItems.push({ icon: res.current.condition.icon, title: "Weather" });
    }
  }

  toggleMenu() {
    this.toggleNavButton.nativeElement.style.display = "block";
    this.toggleNavButton.nativeElement.classList.toggle('visible');
    this.navbar.nativeElement.classList.toggle('collapsed');

    const currText = this.toggleNavButton.nativeElement.innerText;

    if (currText == "📖") {
      this.toggleNavButton.nativeElement.style.display = "none";
    }

    this.toggleNavButton.nativeElement.innerText = currText != "📖" ? "📖" : "📕";
    this.toggleNavButton.nativeElement.title = currText != "📖" ? "Open Navigation" : "Close Navigation";
    window.document.body.style.paddingBottom = currText != "📖" ? "0px" : "50px";
  }
  goTo(event: any) {
    if (event.target.getAttribute("title").toLowerCase() == "close menu") {
      this.toggleMenu();
    } else { 
      this._parent.createComponent(event.target.getAttribute('title'));
    }
    event.stopPropagation();
  }
   
}
