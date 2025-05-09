import { Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { MiningService } from '../../services/mining.service';
import { CalendarService } from '../../services/calendar.service';
import { WeatherService } from '../../services/weather.service';
import { AppComponent } from '../app.component';
import { CoinValueService } from '../../services/coin-value.service';
import { WordlerService } from '../../services/wordler.service';
import { User } from '../../services/datacontracts/user/user';
import { CalendarEntry } from '../../services/datacontracts/calendar/calendar-entry';
import { MiningRig } from '../../services/datacontracts/crypto/mining-rig';
import { NotificationService } from '../../services/notification.service';
import { UserNotification } from '../../services/datacontracts/notification/user-notification';
import { UserService } from '../../services/user.service';
import { FileService } from '../../services/file.service';
import { ExchangeRate } from '../../services/datacontracts/crypto/exchange-rate';

@Component({
  selector: 'app-navigation',
  templateUrl: './navigation.component.html',
  styleUrls: ['./navigation.component.css'],
  standalone: false
})
export class NavigationComponent implements OnInit, OnDestroy {
  @ViewChild('navbar') navbar!: ElementRef<HTMLElement>;
  @ViewChild('toggleNavButton') toggleNavButton!: ElementRef<HTMLElement>;

  private notificationInfoInterval: any;
  private cryptoHubInterval: any;
  private calendarInfoInterval: any;
  private wordlerInfoInterval: any; 
  private lastCollapseTime: Date | null = null;
  private readonly COLLAPSE_COOLDOWN_MS = 60 * 1000;
  navbarReady = false;
  navbarCollapsed: boolean = false;
  isBTCRising = true;
  isLoadingNotifications = false;
  isLoadingTheme = false;
  isLoadingCryptoHub = false;
  isLoadingWordlerStreak = false;
  isLoadingCalendar = false; 
  numberOfNotifications = 0;
  @Input() user?: User;

  constructor(public _parent: AppComponent,
    private miningService: MiningService,
    private calendarService: CalendarService,
    private weatherService: WeatherService,
    private coinValueService: CoinValueService,
    private wordlerService: WordlerService,
    private userService: UserService,
    private fileService: FileService,
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
    this.getThemeInfo();

    this.notificationInfoInterval = setInterval(() => this.getNotificationInfo(), 60 * 1000); // every minute
    this.cryptoHubInterval = setInterval(() => this.getCryptoHubInfo(), 20 * 60 * 1000); // every 20 minutes
    this.calendarInfoInterval = setInterval(() => this.getCalendarInfo(), 20 * 60 * 1000); // every 20 minutes 
    this.wordlerInfoInterval = setInterval(() => this.getWordlerStreakInfo(), 60 * 60 * 1000); // every hour
  }

  stopNotifications() { 
    clearInterval(this.cryptoHubInterval);
    clearInterval(this.calendarInfoInterval);
    clearInterval(this.wordlerInfoInterval);
    clearInterval(this.notificationInfoInterval);
  }
 
  private debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
    let timeout: any;
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }
 
  private debouncedRestartNotifications = this.debounce(() => { 
    if (this.navbarCollapsed) {
      return;
    }

    console.log("debouncedRestartNotifications");
    this.getNotificationInfo();
    this.getCryptoHubInfo();
    this.getCalendarInfo();
    this.getWordlerStreakInfo();
    this.notificationInfoInterval = setInterval(() => this.getNotificationInfo(), 60 * 1000); // every minute
    this.cryptoHubInterval = setInterval(() => this.getCryptoHubInfo(), 20 * 60 * 1000); // every 20 minutes
    this.calendarInfoInterval = setInterval(() => this.getCalendarInfo(), 20 * 60 * 1000); // every 20 minutes 
    this.wordlerInfoInterval = setInterval(() => this.getWordlerStreakInfo(), 60 * 60 * 1000); // every hour
  }, 5000); // 5s debounce delay

  setNotificationNumber(notifs?: number) {  
    if (notifs !== undefined) {
      this.numberOfNotifications = notifs;
    }

    // Safely update the UI
    if (this._parent?.navigationItems) {
      const notificationItem = this._parent.navigationItems.find(x => x.title === "Notifications");
      if (notificationItem) {
        notificationItem.content = this.numberOfNotifications.toString();
      }
    }
  }

  async getNotificationInfo() {
    if (!this._parent || !this._parent.user || this.navbarCollapsed) {
      return;
    }
    this.isLoadingNotifications = true;
    console.log("getting getNotificationInfo");
    try {
      const res = await this.notificationService.getNotifications(this._parent.user.id ?? 0) as UserNotification[];
      if (res) {
        this.numberOfNotifications = res.filter(x => x.isRead == false).length;
        this._parent.navigationItems.filter(x => x.title == "Notifications")[0].content = this.numberOfNotifications + "";

        if (this._parent.userSelectedNavigationItems.find(x => x.title == "Chat")) { 
          const numberOfChatNotifs = res.filter(x => x.chatId && x.isRead == false).length;
          if (numberOfChatNotifs) {
            this._parent.navigationItems.filter(x => x.title == "Chat")[0].content = numberOfChatNotifs + '';
          } else {
            this._parent.navigationItems.filter(x => x.title == "Chat")[0].content = '';
          }
        }
      } else {
        this._parent.navigationItems.filter(x => x.title == "Notifications")[0].content = '';
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
    this.isLoadingNotifications = false;
  }

  async getThemeInfo() {
    if (!this._parent?.user?.id) return;
    this.isLoadingTheme = true;
    try {
      const theme = await this.userService.getTheme(this._parent.user.id);
      if (theme && !theme.message) {
        this.applyThemeToCSS(theme);
      }
    } catch (error) {
      console.error('Error fetching theme data:', error);
    }
    this.isLoadingTheme = false;
  }

  async getCalendarInfo() {
    if (!this.user) { return; }
    if (!this._parent.userSelectedNavigationItems.find(x => x.title == "Calendar")) { return; } 
    try {
      this.isLoadingCalendar = true;
      let notificationCount = 0;
      const today = new Date();
      const startDate = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));  
      const endDate = new Date(startDate);
      endDate.setUTCDate(startDate.getUTCDate() + 1); 

      const res = await this.calendarService.getCalendarEntries(this.user.id, startDate, endDate) as Array<CalendarEntry>;
      if (res && res.length > 0) {
        res.forEach(entry => {
          const entryDate = new Date(entry.date!);
          if (
            // entryDate.getUTCFullYear() === startDate.getUTCFullYear() &&
            // entryDate.getUTCMonth() === startDate.getUTCMonth() &&
            entryDate.getUTCDate() === startDate.getUTCDate()
          ) {
            notificationCount++;
          }
        });
      } 
      this._parent.navigationItems.find(x => x.title == "Calendar")!.content = (notificationCount != 0 ? notificationCount + '' : '');
      this.isLoadingCalendar = false;
    } catch (error) {
      console.error('Error fetching calendar data:', error);
      this.isLoadingCalendar = false;
    }
  }

  async getCurrentWeatherInfo() {
    if (!this._parent.user?.id || !this._parent.userSelectedNavigationItems.find(x => x.title == "Weather")) { return; }

    try {
      const res = await this.weatherService.getWeather(this._parent.user.id);
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
    if (!this.user?.id) { return; }
    if (!this._parent.userSelectedNavigationItems.find(x => x.title.toLowerCase().includes("crypto-hub"))) { return; }
    try {
      let tmpLocalProfitability = 0;
      this.isLoadingCryptoHub = true;
      const res1 = await this.miningService.getMiningRigInfo(this.user.id) as Array<MiningRig>;
      res1?.forEach(x => {
        tmpLocalProfitability += x.localProfitability!;
      });

      await this.coinValueService.isBTCRising().then(res => {
        this.isBTCRising = (Boolean)(res);
      });
      const userCurrency = await this.coinValueService.getUserCurrency(this.user.id) ?? "CAD";
      let latestCurrencyPriceRespectToCAD = 1;
      const ceRes = await this.coinValueService.getLatestCurrencyValuesByName(userCurrency) as ExchangeRate;
      if (ceRes) {
        latestCurrencyPriceRespectToCAD = ceRes.rate;
      }
      const res = await this.coinValueService.getLatestCoinValuesByName("Bitcoin");
      const result = res;
      if (result) {
        const btcToCADRate = result.valueCAD * latestCurrencyPriceRespectToCAD;
        this._parent.navigationItems.filter(x => x.title == "Crypto-Hub")[0].content = "";
        if (tmpLocalProfitability > 0) {
          this._parent.navigationItems.filter(x => x.title == "Crypto-Hub")[0].content += (tmpLocalProfitability * btcToCADRate).toFixed(2).toString() + (btcToCADRate != 1 ? "$" : '');
        }
        this._parent.navigationItems.filter(x => x.title == "Crypto-Hub")[0].content += "\n" + btcToCADRate.toFixed(0) + "$";
      }
      this.isLoadingCryptoHub = false;
    } catch (error) {
      console.error('Error fetching Crypto Hub data:', error);
      this.isLoadingCryptoHub = false;
    }
  }

  async getWordlerStreakInfo() {
    if (!this._parent.user?.id || !this._parent.userSelectedNavigationItems.find(x => x.title.toLowerCase().includes("wordler"))) { return; }
    this.isLoadingWordlerStreak = true;
    try {
      const res = await this.wordlerService.getTodaysDayStreak(this._parent.user.id);
      if (res && res != "0") {
        this._parent.navigationItems.find(x => x.title == "Wordler")!.content = res;
      }
    } catch (error) {
      console.error('Error fetching Wordler streak data:', error);
    }
    this.isLoadingWordlerStreak = false;
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

  goTo(title: string, event: any) {
    if (title.toLowerCase() == "close menu") {
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
      this.lastCollapseTime = new Date(); 
    }
    this.stopNotifications();
  }

  maximizeNav() {
    if (this.navbar) {
      this.navbar.nativeElement.classList.remove('collapsed');
      this.navbarCollapsed = false;
      if (this.toggleNavButton && this.toggleNavButton.nativeElement.style.display == "block") {
        this.toggleMenu();
      }
    }
    this.smartRestartNotifications();
  }
  private smartRestartNotifications() {
    if (!this.lastCollapseTime) {
      // No recent collapse - restart immediately
      this.debouncedRestartNotifications();
      return;
    }

    const timeSinceCollapse = new Date().getTime() - this.lastCollapseTime.getTime();
    const remainingCooldown = this.COLLAPSE_COOLDOWN_MS - timeSinceCollapse;

    if (remainingCooldown <= 0) {
      // Cooldown period has passed
      this.debouncedRestartNotifications();
    } else {
      // Wait until cooldown period ends
      setTimeout(() => {
        this.debouncedRestartNotifications();
      }, remainingCooldown);
    }
  } 
  applyThemeToCSS(theme: any) {
    if (theme.backgroundImage) {
      this.fileService.getFileEntryById(theme.backgroundImage).then(res => {
        if (res) {
          const directLink = `https://bughosted.com/assets/Uploads/${(this._parent.getDirectoryName(res) != '.' ? this._parent.getDirectoryName(res) : '')}${res.fileName}`;
          document.documentElement.style.setProperty('--main-background-image-url', `url(${directLink})`);

          document.body.style.backgroundImage = `url(${directLink})`;
        }
      });
    }
    if (theme.backgroundColor) {
      document.documentElement.style.setProperty('--main-bg-color', theme.backgroundColor);
    }
    if (theme.fontColor) {
      document.documentElement.style.setProperty('--main-font-color', theme.fontColor);
    }
    if (theme.secondaryFontColor) {
      document.documentElement.style.setProperty('--secondary-font-color', theme.secondaryFontColor);
    }
    if (theme.thirdFontColor) {
      document.documentElement.style.setProperty('--third-font-color', theme.thirdFontColor);
    }
    if (theme.mainHighlightColor) {
      document.documentElement.style.setProperty('--main-highlight-color', theme.mainHighlightColor);
    }
    if (theme.mainHighlightColorQuarterOpacity) {
      document.documentElement.style.setProperty('--main-highlight-color-quarter-opacity', theme.mainHighlightColorQuarterOpacity);
    }
    if (theme.componentBackgroundColor) {
      document.documentElement.style.setProperty('--component-background-color', theme.componentBackgroundColor);
    }
    if (theme.secondaryComponentBackgroundColor) {
      document.documentElement.style.setProperty('--secondary-component-background-color', theme.secondaryComponentBackgroundColor);
    }
    if (theme.linkColor) {
      document.documentElement.style.setProperty('--main-link-color', theme.linkColor);
    }
    if (theme.fontSize) {
      document.documentElement.style.setProperty('--main-font-size', `${theme.fontSize}px`);
    }
    if (theme.fontFamily) {
      document.documentElement.style.setProperty('--main-font-family', theme.fontFamily);
    }
  }
}