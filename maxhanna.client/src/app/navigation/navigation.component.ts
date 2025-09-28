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
import { MenuItem } from '../../services/datacontracts/user/menu-item';

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
  tradeNotifsCount = 0;
  navbarReady = false;
  navbarCollapsed: boolean = false;
  isBTCRising = true;
  isLoadingNotifications = false;
  isLoadingTheme = false;
  isLoadingCryptoHub = false;
  isLoadingWordlerStreak = false;
  isLoadingCalendar = false;
  numberOfNotifications = 0;
  showAppSelectionHelp = false;
  defaultTheme = {
    backgroundColor: '#0e0e0e',
    componentBackgroundColor: '#202020',
    secondaryComponentBackgroundColor: '#011300',
    fontColor: '#b0c2b1',
    secondaryFontColor: '#ffffff',
    thirdFontColor: 'cornflowerblue',
    mainHighlightColor: '#3a3a3a',
    mainHighlightColorQuarterOpacity: '#a9a9a9',
    linkColor: 'chartreuse',
    fontSize: 16,
    fontFamily: 'Helvetica, Arial',
    backgroundImage: '',
    name: 'default'
  };
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
      this.displayAppSelectionHelp();
    }, 100)
  }

  ngOnDestroy() {
    clearInterval(this.cryptoHubInterval);
    clearInterval(this.calendarInfoInterval);
    clearInterval(this.wordlerInfoInterval);
    clearInterval(this.notificationInfoInterval);
    this.showAppSelectionHelp = false;
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

    this.notificationInfoInterval = setInterval(() => this.getNotificationInfo(), 20 * 1000); // every minute
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
 
    this.getNotificationInfo();
    this.getCryptoHubInfo();
    this.getCalendarInfo();
    this.getWordlerStreakInfo();
    this.notificationInfoInterval = setInterval(() => this.getNotificationInfo(), 60 * 1000); // every minute
    this.cryptoHubInterval = setInterval(() => this.getCryptoHubInfo(), 20 * 60 * 1000); // every 20 minutes
    this.calendarInfoInterval = setInterval(() => this.getCalendarInfo(), 20 * 60 * 1000); // every 20 minutes 
    this.wordlerInfoInterval = setInterval(() => this.getWordlerStreakInfo(), 60 * 60 * 1000); // every hour
  }, 5000); // 5s debounce delay

  setNotificationNumber(notifs?: number, notification?: UserNotification) {
    if (notifs !== undefined) {
      this.numberOfNotifications = notifs;
    }

    if (this._parent?.navigationItems) {
      const notificationNavItem = this._parent.navigationItems.find(x => x.title === "Notifications");
      if (notificationNavItem) {
        notificationNavItem.content = this.numberOfNotifications.toString();
      }
      if (notifs == 0) {
        const chatNavItem = this._parent?.navigationItems?.find(x => x.title === "Chat");
        if (chatNavItem) {
          chatNavItem.content = '';
        }
      } else {
        if (notification?.chatId) {
          const notificationItem = this._parent.navigationItems.find(x => x.title === "Chat");
          if (notificationItem && notification.isRead) {
            notificationItem.content = parseInt(notificationItem.content ?? '1') - 1 == 0 ? '' : (parseInt(notificationItem.content ?? '1') - 1 + '');
          } else if (notificationItem && !notification.isRead) {
            notificationItem.content = (parseInt(notificationItem.content?.trim() ?? '0') || 0) + 1 + '';
          }
        }
      }
    }
  }

  async getNotificationInfo() {
    if (!this._parent || !this._parent.user || this.navbarCollapsed) {
      return;
    }
    this.isLoadingNotifications = true;
    try { 
      const res = await this.notificationService.getNotifications(this._parent.user.id ?? 0) as UserNotification[];
      if (res) {
        const currentTradeNotifsCount = res.filter(x => x.text?.includes("Executed Trade") && x.isRead == false).length;
        const latestTradeNotif = res.find(x => x.text?.includes("Executed Trade") && x.isRead == false);
        if (currentTradeNotifsCount > this.tradeNotifsCount) {
          this._parent.showNotification(latestTradeNotif?.text);
        }
        this.tradeNotifsCount = currentTradeNotifsCount;
        const chatItem = this._parent.navigationItems.find(x => x.title === "Chat");
        const chatItemContent = chatItem?.content ?? "0";
        const currentChatNotifCount = parseInt(chatItemContent, 10) || 0;  
        this.numberOfNotifications = res.filter(x => x.isRead == false).length;
        this._parent.navigationItems.filter(x => x.title == "Notifications")[0].content = this.numberOfNotifications + "";
        if (this._parent.userSelectedNavigationItems.find(x => x.title == "Chat")) {
          const numberOfChatNotifs = res.filter(x => x.chatId && x.isRead == false).length;

          if (numberOfChatNotifs) {
            if (currentChatNotifCount < numberOfChatNotifs) {
              this._parent.showNotification(`${numberOfChatNotifs - currentChatNotifCount} New chat message${numberOfChatNotifs > 1 ? 's' : ''}.`);
            }
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

  async getThemeInfo(userId?: number) {
    if (!this._parent?.user?.id && !userId) {
      this.applyDefaultTheme();
      return;
    } 
    this.isLoadingTheme = true;
    try {
      const theme = await this.userService.getTheme(userId ?? this._parent?.user?.id ?? 0);
      if (theme && !theme.message) {
        this.applyThemeToCSS(theme); 
      } else { 
        this.applyDefaultTheme();
      }
    } catch (error) {
      console.error('Error fetching theme data:', error);
    }
    this.isLoadingTheme = false;
  }
  private applyDefaultTheme() {
    document.documentElement.style.setProperty('--main-background-image-url', this.defaultTheme.backgroundImage);
    document.body.style.backgroundImage = ``;
    document.documentElement.style.setProperty('--main-bg-color', this.defaultTheme.backgroundColor);
    document.documentElement.style.setProperty('--component-background-color', this.defaultTheme.componentBackgroundColor);
    document.documentElement.style.setProperty('--secondary-component-background-color', this.defaultTheme.secondaryComponentBackgroundColor);
    document.documentElement.style.setProperty('--main-font-color', this.defaultTheme.fontColor);
    document.documentElement.style.setProperty('--secondary-font-color', this.defaultTheme.secondaryFontColor);
    document.documentElement.style.setProperty('--third-font-color', this.defaultTheme.thirdFontColor);
    document.documentElement.style.setProperty('--main-highlight-color', this.defaultTheme.mainHighlightColor);
    document.documentElement.style.setProperty('--main-highlight-color-quarter-opacity', this.defaultTheme.mainHighlightColorQuarterOpacity);
    document.documentElement.style.setProperty('--main-link-color', this.defaultTheme.linkColor);
    document.documentElement.style.setProperty('--main-font-size', `${this.defaultTheme.fontSize}px`);
    document.documentElement.style.setProperty('--main-font-family', this.defaultTheme.fontFamily);
  }

  async getCalendarInfo() {
    if (!this.user || !this._parent.userSelectedNavigationItems.some(x => x.title === "Calendar")) return;

    try {
      this.isLoadingCalendar = true;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - 1);
      const res = await this.calendarService.getCalendarEntries(this.user.id, startDate, new Date(today.getTime() + 86400000));

      const notificationCount = res?.filter((entry: CalendarEntry) => entry.date && this.isRelevantEvent(entry, today)).length ?? 0;

      this._parent.navigationItems.find(x => x.title === "Calendar")!.content = notificationCount ? notificationCount.toString() : '';
    } catch (error) {
      console.error('Error fetching calendar data:', error);
    } finally {
      this.isLoadingCalendar = false;
    }
  }

  private isRelevantEvent(entry: CalendarEntry, today: Date): boolean {
    if (!entry.date) return false;
    const entryDate = typeof entry.date === 'string' ? new Date(entry.date) : entry.date;
    const type = entry.type?.toLowerCase() ?? '';

    return this.isSameDate(entryDate, today) ||
      this.isWeeklyEvent(type, entryDate, today) ||
      this.isMonthlyEvent(type, entryDate, today) ||
      this.isAnnualEvent(type, entryDate, today) ||
      type === 'daily';
  }

  // Simplified comparison functions
  private isSameDate = (d1: Date, d2: Date) => d1.toDateString() === d2.toDateString();
  private isWeeklyEvent = (type: string, d1: Date, d2: Date) => type === 'weekly' && d1.getDay() === d2.getDay();
  private isMonthlyEvent = (type: string, d1: Date, d2: Date) => type === 'monthly' && d1.getDate() === d2.getDate();
  private isAnnualEvent = (type: string, d1: Date, d2: Date) =>
    ['milestone', 'annually', 'birthday', 'newyears', 'anniversary', 'christmas'].includes(type) &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

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

  goTo(title: string, event?: any) { 
    if (title.toLowerCase() == "close menu") {
      this.toggleMenu();
    } else if (title == "UpdateUserSettings") {
      this._parent.createComponent(title, { inputtedParentRef: this._parent });
    } else if (title.toLowerCase() != "help") {
      this._parent.createComponent(title);
    }

    if (title.toLowerCase() == "help") {
      this.showAppSelectionHelp = true;
    } else {
      this.showAppSelectionHelp = false;
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
      const requesterId = this._parent?.user?.id;
      this.fileService.getFileEntryById(theme.backgroundImage, requesterId).then(res => {
        if (res) {
          const directLink = `https://bughosted.com/assets/Uploads/${(this._parent.getDirectoryName(res) != '.' ? this._parent.getDirectoryName(res) : '')}${res.fileName}`;
          document.documentElement.style.setProperty('--main-background-image-url', `url(${directLink})`);
          document.body.style.backgroundImage = `url(${directLink})`;
        } else {
          document.documentElement.style.setProperty('--main-background-image-url', `none`);
          document.body.style.backgroundImage = `none`;
        }
      });
    } else {
      document.documentElement.style.setProperty('--main-background-image-url', `none`);
      document.body.style.backgroundImage = `none`;
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
  displayAppSelectionHelp(force = false) {
    const hasSeenAppSelection = this._parent.getCookie('hasSeenAppSelectionPopup1');
    const user = this._parent.user;
    const now = new Date().getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;
    let showAppSelector = false;

    if (!hasSeenAppSelection) {
      if (force) {
        showAppSelector = true;
      }
      else if (!user || !user.id || user.id === 0) {
        showAppSelector = true;
      } 
      else if (user.created) { 
        const createdAt = new Date(user.created).getTime();
        if ((now - createdAt) < oneDayMs) {
          showAppSelector = true;
        }
      }

      if (showAppSelector) {
        this.showAppSelectionHelp = true; // auto-trigger the UI section
        this._parent.setCookie('hasSeenAppSelectionPopup1', 'true', 2); // remember for 2 days
      }
    }
  }
  descriptionsExist(item: string) {
    return this._parent.navigationItemDescriptions.some((x:MenuItem) => x.title == item);
  }
  closeNotifications() {
    console.log('closing');
    this.isLoadingCryptoHub = false;
    this.isLoadingNotifications = false;
    this.isLoadingTheme = false;
    this.isLoadingWordlerStreak = false;
    this.isLoadingCalendar = false; 
  }
}