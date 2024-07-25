import { Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';  
import { MiningService } from '../../services/mining.service';
import { CalendarService } from '../../services/calendar.service';
import { WeatherService } from '../../services/weather.service';
import { UserService } from '../../services/user.service';
import { ChatService } from '../../services/chat.service';
import { AppComponent } from '../app.component';
import { CoinValueService } from '../../services/coin-value.service';
import { WordlerService } from '../../services/wordler.service';
import { User } from '../../services/datacontracts/user/user';
import { MiningWalletResponse } from '../../services/datacontracts/crypto/mining-wallet-response';
import { CalendarEntry } from '../../services/datacontracts/calendar/calendar-entry';
import { MiningRig } from '../../services/datacontracts/crypto/mining-rig';

@Component({
  selector: 'app-navigation',
  templateUrl: './navigation.component.html',
  styleUrls: ['./navigation.component.css']
})
export class NavigationComponent implements OnInit, OnDestroy {
  @ViewChild('navbar') navbar!: ElementRef<HTMLElement>;
  @ViewChild('toggleNavButton') toggleNavButton!: ElementRef<HTMLElement>;

  private chatInfoInterval: any;
  private miningInfoInterval: any;
  private calendarInfoInterval: any;
  private coinWalletInfoInterval: any;
  private wordlerInfoInterval: any;

  @Input() user?: User;

  constructor(public _parent: AppComponent,
    private miningService: MiningService,
    private calendarService: CalendarService,
    private weatherService: WeatherService,
    private coinValueService: CoinValueService,
    private userService: UserService,
    private wordlerService: WordlerService,
    private chatService: ChatService) {
  }
  async ngOnInit() {
    this.getNotifications();
  }
  ngOnDestroy() { // Clear intervals when component is destroyed to prevent memory leaks
    clearInterval(this.chatInfoInterval);
    clearInterval(this.miningInfoInterval);
    clearInterval(this.calendarInfoInterval);
    clearInterval(this.coinWalletInfoInterval);
    clearInterval(this.wordlerInfoInterval);
    this.clearNotifications();
  }
  clearNotifications() {
    const itemsToClear = [
      "MiningRigs",
      "Coin-Watch",
      "Chat",
      "Coin-Wallet",
      "Calendar",
      "Weather",
      "MiningDevices",
      "Wordler"
    ];

    itemsToClear.forEach(title => {
      const item = this._parent.navigationItems.find(x => x.title === title);
      if (item) {
        item.content = '';
      }
    });
  }
  async getNotifications() {
    await this.getSelectedMenuItems();
    this.getCurrentWeatherInfo();
    this.getMiningInfo();
    this.getCalendarInfo();
    this.getCoinWalletInfo();
    this.getChatInfo();
    this.getWordlerStreakInfo();

    this.chatInfoInterval = setInterval(() => this.getChatInfo(), 60 * 1000); // every minute
    this.miningInfoInterval = setInterval(() => this.getMiningInfo(), 20 * 60 * 1000); // every 20 minutes
    this.calendarInfoInterval = setInterval(() => this.getCalendarInfo(), 20 * 60 * 1000); // every 20 minutes
    this.coinWalletInfoInterval = setInterval(() => this.getCoinWalletInfo(), 60 * 60 * 1000); // every hour
    this.wordlerInfoInterval = setInterval(() => this.getWordlerStreakInfo(), 60 * 60 * 1000); // every hour
  }
  async getSelectedMenuItems() {
    this._parent.userSelectedNavigationItems = await this.userService.getUserMenu(this.user!);
  }
  menuIconsIncludes(title: string) {
    return this._parent.userSelectedNavigationItems.some(x => x.title == title);
  }
  async getChatInfo() {
    if (!this._parent.user) {
      return;
    }
    if (!this._parent.userSelectedNavigationItems.find(x => x.title == "Chat")) { return; }
    const res = await this.chatService.getChatNotifications(this._parent.user!);
    if (res && res != 0 && res != "NaN") {
      this._parent.navigationItems.filter(x => x.title == "Chat")[0].content = res + '';
    } else {
      this._parent.navigationItems.filter(x => x.title == "Chat")[0].content = '';
    }
  }
  async getCoinWalletInfo() {
    if (!this.user) { return; }
    if (!this._parent.userSelectedNavigationItems.find(x => x.title == "Coin-Wallet")) { return; }
    const res = await this.miningService.getMiningWallet(this.user!) as MiningWalletResponse;
    if (res && res.currencies) {
      const totalBalance = res.currencies.find(x => x.currency!.toUpperCase() == "BTC")!.totalBalance!;
      const fiatRate = res!.currencies!.find(x => x.currency?.toUpperCase() == "BTC")?.fiatRate!;
      const product = (parseFloat(totalBalance) * fiatRate).toFixed(0) + '$';
      this._parent.navigationItems.filter(x => x.title == "Coin-Wallet")[0].content = product + '';
    } else {
      this._parent.navigationItems.filter(x => x.title == "Coin-Wallet")[0].content = '';
    }
  }
  async getCalendarInfo() {
    if (!this.user) { return; }
    if (!this._parent.userSelectedNavigationItems.find(x => x.title == "Calendar")) { return; }
    let notificationCount = 0;
    const startDate = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 1);
    const res = await this.calendarService.getCalendarEntries(this.user!, startDate, endDate) as Array<CalendarEntry>;
    if (res && res.length > 0) {
      res.forEach(x => {
        if (new Date(x.date!).getDate() == startDate.getDate()) {
          notificationCount++;
        }
      })
    }
    this._parent.navigationItems.find(x => x.title == "Calendar")!.content = (notificationCount != 0 ? notificationCount + '' : '');
  }
  async getCurrentWeatherInfo() {
    if (!this._parent.user || !this._parent.userSelectedNavigationItems.find(x => x.title == "Weather")) { return; }

    try {
      const res = await this.weatherService.getWeather(this._parent.user!);
      if (res?.current.condition.icon && res?.current.condition.icon.includes('weatherapi')) {
        this._parent.navigationItems.filter(x => x.title == "Weather")[0].content = res?.current.temp_c.toString() + "°C";
        this._parent.navigationItems.filter(x => x.title == "Weather")[0].icon = res.current.condition.icon;
      } else {
        this._parent.navigationItems.filter(x => x.title == "Weather")[0].content = "?";
      }
    } catch {

    }
   
  }
  async getMiningInfo() {
    if (!this.user) { return; }
    if (!this._parent.userSelectedNavigationItems.find(x => x.title.toLowerCase().includes("mining"))) { return; }
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
    if (!this._parent.userSelectedNavigationItems.find(x => x.title.toLowerCase().includes("mining") || x.title == "Coin-Watch")) { return; }
    const res = await this.coinValueService.getLatestCoinValuesByName("Bitcoin");
    const result = res;
    if (result) {
      const btcToCADRate = result.valueCAD; 
      this._parent.navigationItems.filter(x => x.title == "MiningRigs")[0].content = (tmpLocalProfitability * btcToCADRate).toFixed(2).toString() + (btcToCADRate != 1 ? "$" : '');
      this._parent.navigationItems.filter(x => x.title == "Coin-Watch")[0].content = btcToCADRate.toFixed(0) + "$";
    }
  }

  async getWordlerStreakInfo() {
    if (!this._parent.userSelectedNavigationItems.find(x => x.title.toLowerCase().includes("wordler"))) { return; }
    const res = await this.wordlerService.getConsecutiveDayStreak(this._parent.user!); 
    if (res) {  
      this._parent.navigationItems.find(x => x.title == "Wordler")!.content = res;
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
    if (event.target.getAttribute("title")?.toLowerCase() == "close menu") {
      this.toggleMenu();
    } else {
      this._parent.createComponent(event.target.getAttribute('title'));
    }
    event.stopPropagation();
  }
  shouldDisplayItem(title: string): boolean {
    // Logic to determine if an item should be displayed
    const alwaysDisplay = ['Close Menu', 'User', 'Meme', 'Social', 'Wordler', 'Emulation', 'Files'];
    return this.menuIconsIncludes(title) || alwaysDisplay.includes(title);
  } 
}
