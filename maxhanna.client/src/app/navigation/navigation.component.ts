import { Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';  
import { MiningService } from '../../services/mining.service';
import { CalendarService } from '../../services/calendar.service';
import { WeatherService } from '../../services/weather.service'; 
import { AppComponent } from '../app.component';
import { CoinValueService } from '../../services/coin-value.service';
import { WordlerService } from '../../services/wordler.service';
import { User } from '../../services/datacontracts/user/user';
import { MiningWalletResponse } from '../../services/datacontracts/crypto/mining-wallet-response';
import { CalendarEntry } from '../../services/datacontracts/calendar/calendar-entry';
import { MiningRig } from '../../services/datacontracts/crypto/mining-rig';
import { NotificationService } from '../../services/notification.service';
import { UserNotification } from '../../services/datacontracts/notification/user-notification';

@Component({
  selector: 'app-navigation',
  templateUrl: './navigation.component.html',
  styleUrls: ['./navigation.component.css']
})
export class NavigationComponent implements OnInit, OnDestroy {
  @ViewChild('navbar') navbar!: ElementRef<HTMLElement>;
  @ViewChild('toggleNavButton') toggleNavButton!: ElementRef<HTMLElement>;

  private notificationInfoInterval: any;
  private cryptoHubInterval: any;
  private calendarInfoInterval: any; 
  private wordlerInfoInterval: any;

  navbarReady = false;
  navbarCollapsed: boolean = false;  
  @Input() user?: User;

  constructor(public _parent: AppComponent,
    private miningService: MiningService,
    private calendarService: CalendarService,
    private weatherService: WeatherService,
    private coinValueService: CoinValueService, 
    private wordlerService: WordlerService,
    private notificationService: NotificationService) {
  }
  async ngOnInit() {
    this.navbarReady = true;

    setTimeout(() => {
      this.getNotifications();
    }, 100)
  }

  ngOnDestroy() {  
    clearInterval(this.cryptoHubInterval);
    clearInterval(this.calendarInfoInterval); 
    clearInterval(this.wordlerInfoInterval);
    clearInterval(this.notificationInfoInterval);
    this.clearNotifications();
  } 
  clearNotifications() {
    const itemsToClear = [
      "Crypto-Hub", 
      "Notification", 
      "Calendar", 
      "Chat",  
      "Weather", 
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
    if (!this._parent || !this._parent.user || this._parent.user.id == 0) return;
    
    this.getCurrentWeatherInfo(); 
    this.getCalendarInfo();
    this.getCryptoHubInfo();
    this.getNotificationInfo();
    this.getWordlerStreakInfo();

    this.notificationInfoInterval = setInterval(() => this.getNotificationInfo(), 60 * 1000); // every minute
    this.cryptoHubInterval = setInterval(() => this.getCryptoHubInfo(), 20 * 60 * 1000); // every 20 minutes
    this.calendarInfoInterval = setInterval(() => this.getCalendarInfo(), 20 * 60 * 1000); // every 20 minutes 
    this.wordlerInfoInterval = setInterval(() => this.getWordlerStreakInfo(), 60 * 60 * 1000); // every hour
  }
  
   
  async getNotificationInfo() {
    if (!this._parent || !this._parent.user) {
      return;
    }
    const res = await this.notificationService.getNotifications(this._parent.user) as UserNotification[];
    if (res) {
      this._parent.navigationItems.filter(x => x.title == "Notifications")[0].content = res.filter(x => x.isRead == false).length + '';

      if (this._parent.userSelectedNavigationItems.find(x => x.title == "Chat")) {
        //get # of chat notifs
        const numberOfChatNotifs = res.filter(x => x.chatId && x.isRead == false).length;
        if (numberOfChatNotifs) { 
          this._parent.navigationItems.filter(x => x.title == "Chat")[0].content = numberOfChatNotifs + ''; 
        }
      }
    } else {
      this._parent.navigationItems.filter(x => x.title == "Notifications")[0].content = '';
    }
  }
 
  async getCalendarInfo() { 
    if (!this.user) { return; }
    if (!this._parent.userSelectedNavigationItems.find(x => x.title == "Calendar")) { return; }

    let notificationCount = 0;
    const today = new Date();
    const startDate = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())); // Midnight today in UTC
    const endDate = new Date(startDate);
    endDate.setUTCDate(startDate.getUTCDate() + 1); // Midnight tomorrow in UTC

    const res = await this.calendarService.getCalendarEntries(this.user!, startDate, endDate) as Array<CalendarEntry>;
    if (res && res.length > 0) { 
      res.forEach(entry => {
        const entryDate = new Date(entry.date!);
        if (
          entryDate.getUTCFullYear() === startDate.getUTCFullYear() &&
          entryDate.getUTCMonth() === startDate.getUTCMonth() &&
          entryDate.getUTCDate() === startDate.getUTCDate()
        ) {
          notificationCount++;
          console.log(notificationCount);
        } 
      });
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
  async getCryptoHubInfo() { 
    if (!this.user) { return; }
    if (!this._parent.userSelectedNavigationItems.find(x => x.title.toLowerCase().includes("crypto-hub"))) { return; }
    let tmpLocalProfitability = 0;

    const res1 = await this.miningService.getMiningRigInfo(this.user!) as Array<MiningRig>;
    res1?.forEach(x => {
      tmpLocalProfitability += x.localProfitability!;
    });
     
    const res = await this.coinValueService.getLatestCoinValuesByName("Bitcoin");
    const result = res;
    if (result) {
      const btcToCADRate = result.valueCAD;
      this._parent.navigationItems.filter(x => x.title == "Crypto-Hub")[0].content = "";
      if (tmpLocalProfitability > 0) {
        this._parent.navigationItems.filter(x => x.title == "Crypto-Hub")[0].content += (tmpLocalProfitability * btcToCADRate).toFixed(2).toString() + (btcToCADRate != 1 ? "$" : '');
      }
      this._parent.navigationItems.filter(x => x.title == "Crypto-Hub")[0].content += "\n" + btcToCADRate.toFixed(0) + "$";
    }
  }

  async getWordlerStreakInfo() {
    if (!this._parent.userSelectedNavigationItems.find(x => x.title.toLowerCase().includes("wordler"))) { return; }
    const res = await this.wordlerService.getTodaysDayStreak(this._parent.user!); 
    if (res && res != "0") {  
      this._parent.navigationItems.find(x => x.title == "Wordler")!.content = res;
    }
  }
  toggleMenu() {
    this.toggleNavButton.nativeElement.style.display = "block";
    this.toggleNavButton.nativeElement.classList.toggle('visible');
    this.navbar.nativeElement.classList.toggle('collapsedNavbar');

    const currText = this.toggleNavButton.nativeElement.innerText;

    if (currText == "📖") {
      this.toggleNavButton.nativeElement.style.display = "none";
    }

    this.toggleNavButton.nativeElement.innerText = currText != "📖" ? "📖" : "📕";
    this.toggleNavButton.nativeElement.title = currText != "📖" ? "Open Navigation" : "Close Navigation";
    window.document.body.style.paddingBottom = currText != "📖" ? "0px" : "50px";
  }

  parseNumber(notifNumbers?: string) { 
    if (!notifNumbers || notifNumbers.trim() == "") return 0;
    return parseInt(notifNumbers);
  }

  goTo(event: any) {
    const title = event.target.getAttribute('title'); 
    if (event.target.getAttribute("title")?.toLowerCase() == "close menu") {
      this.toggleMenu();
    } else if (title == "UpdateUserSettings") {
      this._parent.createComponent(title, { inputtedParentRef: this._parent });
    } else {
      this._parent.createComponent(title);
    }
    event.stopPropagation();
  }
  menuIconsIncludes(title: string) { 
      return this._parent.userSelectedNavigationItems.some(x => x.title == title); 
  }
 
  minimizeNav() {
    if (this.navbar) {
      this.navbar.nativeElement.classList.add('collapsed');
      this.navbarCollapsed = true; 
    }
  }
  maximizeNav() {
    if (this.navbar) {
      this.navbar.nativeElement.classList.remove('collapsed');
      this.navbarCollapsed = false;
      if (this.toggleNavButton && this.toggleNavButton.nativeElement.style.display == "block") {
        this.toggleMenu(); 
      }
    }
  }
}
