import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { AppComponent } from '../app.component';
import { HttpClient, HttpParams } from '@angular/common/http';
import { WeatherResponse } from '../weather-response';
import { ChildComponent } from '../child.component';
import { MiningRig } from '../mining-rig';
import { CoinWatchResponse } from '../coin-watch-response';
import { CalendarEntry } from '../calendar-entry';

@Component({
  selector: 'app-navigation',
  templateUrl: './navigation.component.html',
  styleUrls: ['./navigation.component.css'] // Use styleUrls instead of styleUrl
})
export class NavigationComponent extends ChildComponent implements OnInit {
  @ViewChild('navbar') navbar!: ElementRef<HTMLElement>;
  @ViewChild('toggleNavButton') toggleNavButton!: ElementRef<HTMLElement>;
  btcToCADRate = 1;
  localProfitability = 1;
  highestTemp = 0;
  navigationItems = [
    { icon: "📕", title: "Close Menu", content: ''},
    { icon: "📅", title: "Calendar", content: undefined},
    { icon: "🔍", title: "Favourites", content: undefined },
    { icon: "⛏️", title: "MiningDevices", content: undefined },
    { icon: "🖥️", title: "MiningRigs", content: undefined },
    { icon: "📁", title: "Files", content: undefined},
    { icon: "✔️", title: "Todo", content: undefined},
    { icon: "🎼", title: "Music", content: undefined},
    { icon: "🗒️", title: "Notepad", content: undefined},
    { icon: "📇", title: "Contacts", content: undefined},
    { icon: "🎮", title: "Game", content: undefined},
    { icon: "🕹️", title: "Gbc", content: undefined},
    { icon: "💵", title: "Coin-Wallet", content: undefined},
    { icon: "₿", title: "Coin-Watch", content: undefined},
  ];


  constructor(private _parent: AppComponent, private http: HttpClient) {
    super();
  }
  async ngOnInit() {
    this.getCurrentWeatherInfo();
    this.getCoinWatchInfo();
    this.getMiningInfo();
    this.getCalendarInfo();
  }
  async getCalendarInfo() {
    let notificationCount = 0;
    const startDate = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 1);

    const params = new HttpParams()
      .set('startDate', startDate.toISOString())
      .set('endDate', endDate.toISOString());

    const res = await this.http.get<CalendarEntry[]>('/calendar', { params }).toPromise();
    res?.forEach(x => {
      console.log(new Date(x.date!));
      console.log(startDate);
      if (new Date(x.date!).getDate() == startDate.getDate()) {
        console.log("matching date");
        notificationCount++;
      }
    })
    this.navigationItems.filter(x => x.title == "Calendar")[0].content = notificationCount + "";

  }
  async getCurrentWeatherInfo() {
    const res = await this.http.get<WeatherResponse>('/weatherforecast').toPromise();
    if (res?.current.condition.icon && res?.current.condition.icon.includes('weatherapi')) {
      this.navigationItems.push({ icon: res.current.condition.icon, title: "Weather", content: res?.current.temp_c.toString() + "°C" });
    }
  }
  async getMiningInfo() {
    const res = await this.http.get<Array<MiningRig>>('/mining/').toPromise();
    this._parent.miningInfo = res!;
    this.localProfitability = 0;
    res?.forEach(x => {
      this.localProfitability += x.localProfitability!;
      x.devices?.forEach(device => {
        if (device.temperature! >= this.highestTemp) {
          this.highestTemp = device.temperature!;
        }
      });
    });
    this.navigationItems.filter(x => x.title == "MiningRigs")[0].content = (this.localProfitability * this.btcToCADRate).toFixed(2).toString() + (this.btcToCADRate != 1 ? "$" : '');
    this.navigationItems.filter(x => x.title == "MiningDevices")[0].content = this.highestTemp + "°C";
  }
  async getCoinWatchInfo() {
    const res = await fetch(
      new Request("https://api.livecoinwatch.com/coins/list"),
      {
        method: "POST",
        headers: new Headers({
          "content-type": "application/json",
          "x-api-key": "49965ff1-ebed-48b2-8ee3-796c390fcde1",
        }),
        body: JSON.stringify(
          {
            currency: "CAD",
            sort: "rank",
            order: "ascending",
            offset: 0,
            limit: 8,
            meta: true,
          }
        ),
      }
    ).then(response => response.json()) as CoinWatchResponse[];
    this._parent.coinWatchInfo = res;
    this.btcToCADRate = this._parent.coinWatchInfo.find(x => x.name?.toLowerCase() == "bitcoin")?.rate!;
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
