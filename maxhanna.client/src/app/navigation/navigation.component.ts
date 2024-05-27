import { Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { MiningWalletResponse } from '../../services/datacontracts/mining-wallet-response';
import { CalendarEntry } from '../../services/datacontracts/calendar-entry';
import { MiningRig } from '../../services/datacontracts/mining-rig';
import { CoinWatchResponse } from '../../services/datacontracts/coin-watch-response';
import { User } from '../../services/datacontracts/user';
import { MiningService } from '../../services/mining.service';
import { CalendarService } from '../../services/calendar.service';
import { WeatherService } from '../../services/weather.service';
import { CoinWatchService } from '../../services/coin-watch.service';
import { AppComponent } from '../app.component';
import { UserService } from '../../services/user.service';
import { MenuItem } from '../../services/datacontracts/menu-item';
import { ChatService } from '../../services/chat.service';

@Component({
  selector: 'app-navigation',
  templateUrl: './navigation.component.html',
  styleUrls: ['./navigation.component.css'] // Use styleUrls instead of styleUrl
})
export class NavigationComponent implements OnInit {
  @ViewChild('navbar') navbar!: ElementRef<HTMLElement>;
  @ViewChild('toggleNavButton') toggleNavButton!: ElementRef<HTMLElement>;

  @Input() user?: User;

  constructor(public _parent: AppComponent,
    private miningService: MiningService,
    private calendarService: CalendarService,
    private weatherService: WeatherService,
    private coinwatchService: CoinWatchService,
    private userService: UserService,
    private chatService: ChatService) {
  }
  async ngOnInit() {
    this.getCurrentWeatherInfo();
    this.getMiningInfo();
    this.getCalendarInfo();
    this.getCoinWalletInfo();
    this.getSelectedMenuItems();
    this.getChatInfo();
  }
  async getSelectedMenuItems() {
    this._parent.selectedMenuItems = await this.userService.getUserMenu(this.user!);
  }
  menuIconsIncludes(title: string) {
    return this._parent.selectedMenuItems.filter(x => x.title == title).length > 0;
  }
  async getChatInfo() {
    const res = await this.chatService.getChatNotifications(this._parent.user!);
    console.log(res + ": chat notifs");
    if (res && res != 0) {
      this._parent.navigationItems.filter(x => x.title == "Chat")[0].content = res + "";
    }
  }
  async getCoinWalletInfo() {
    const res = await this.miningService.getMiningWallet(this.user!) as MiningWalletResponse;

    if (res && res.currencies) {
      const totalBalance = res.currencies.find(x => x.currency!.toUpperCase() == "BTC")!.totalBalance!;
      const fiatRate = res!.currencies!.find(x => x.currency?.toUpperCase() == "BTC")?.fiatRate!;
      const product = (parseFloat(totalBalance) * fiatRate).toFixed(0) + "$";
      this._parent.navigationItems.filter(x => x.title == "Coin-Wallet")[0].content = product + "";
    }
  }
  async getCalendarInfo() {
    let notificationCount = 0;
    const startDate = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 1);
    const res = await this.calendarService.getCalendarEntries(this.user!, startDate, endDate) as Array<CalendarEntry>;
    res.forEach(x => {
      if (new Date(x.date!).getDate() == startDate.getDate()) {
        notificationCount++;
      }
    })
    this._parent.navigationItems.filter(x => x.title == "Calendar")[0].content = (notificationCount != 0 ? notificationCount + '' : '');
  }
  async getCurrentWeatherInfo() {
    const res = await this.weatherService.getWeather(this.user!);
    if (res?.current.condition.icon && res?.current.condition.icon.includes('weatherapi')) {
      this._parent.navigationItems.filter(x => x.title == "Weather")[0].content = res?.current.temp_c.toString() + "°C";
      this._parent.navigationItems.filter(x => x.title == "Weather")[0].icon = res.current.condition.icon;
    }
  }
  async getMiningInfo() {
    let tmpLocalProfitability = 0;
    let tmpNumberOfDevices = 0;
    let tmpNumberOfOnlineDevices = 0;
    let tmpHighestTemp = 0;
    const res = await this.miningService.getMiningRigInfo(this.user!) as Array<MiningRig>;

    res?.forEach(x => {
      tmpLocalProfitability += x.localProfitability!;
      x.devices?.forEach(device => {
        if (device.temperature! >= tmpHighestTemp) {
          tmpHighestTemp = device.temperature!;
        }
        if (device.state == 2) {
          tmpNumberOfOnlineDevices++;
          tmpNumberOfDevices++;
        } else if (!(device.deviceName?.includes("CPU") || device.deviceName?.includes("AMD"))) {
          tmpNumberOfDevices++;
        }
      });
    });
    this._parent.navigationItems.filter(x => x.title == "MiningDevices")[0].content = `${tmpHighestTemp}°C\n${tmpNumberOfOnlineDevices}/${tmpNumberOfDevices}`;
    this.getCoinWatchInfo(tmpLocalProfitability);

  }
  async getCoinWatchInfo(tmpLocalProfitability: number) {
    const res = await this.coinwatchService.getCoinwatchResponse(this.user!);
    const result = res as CoinWatchResponse[];
    if (result && result.length > 0) {
      const btcToCADRate = result.find(x => x.name?.toLowerCase() == "bitcoin")?.rate!;
      this._parent.navigationItems.filter(x => x.title == "MiningRigs")[0].content = (tmpLocalProfitability * btcToCADRate).toFixed(2).toString() + (btcToCADRate != 1 ? "$" : '');
      this._parent.navigationItems.filter(x => x.title == "Coin-Watch")[0].content = btcToCADRate.toFixed(0) + "$";
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
