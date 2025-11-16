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
import { EnderService } from '../../services/ender.service';
import { BonesService } from '../../services/bones.service';
import { NexusService } from '../../services/nexus.service';
import { TodoService } from '../../services/todo.service';
import { MetaService } from '../../services/meta.service';
import { ArrayService } from '../../services/array.service';
import { RomService } from '../../services/rom.service';
import { FriendService } from '../../services/friend.service';
import { SocialService } from '../../services/social.service';
import { CrawlerService } from '../../services/crawler.service';
import { NewsService } from '../../services/news.service';

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
  isLoadingEnder = false;
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
    private notificationService: NotificationService,
    private enderService: EnderService,
    private bonesService: BonesService,
    private nexusService: NexusService,
    private todoService: TodoService,
    private metaService: MetaService,
    private arrayService: ArrayService,
    private romService: RomService,
    private friendService: FriendService,
    private socialService: SocialService,
    private crawlerService: CrawlerService,
    private newsService: NewsService) {
  }

  // runtime values for Ender nav item
  enderActivePlayers: number | null = null;
  enderUserRank: { rank?: number | null, score?: number | null, totalPlayers?: number | null } | null = null;
  private enderInterval: any;
  // runtime values for Bones nav item
  bonesActivePlayers: number | null = null;
  bonesUserRank: { rank?: number | null, level?: number | null, totalPlayers?: number | null } | null = null;
  private bonesInterval: any;
  // runtime values for Nexus (Bug-Wars)
  nexusActivePlayers: number | null = null;
  nexusUserRank: { rank?: number | null, baseCount?: number | null, totalPlayers?: number | null } | null = null;
  private nexusInterval: any;
  // runtime values for Meta-Bots
  metaActivePlayers: number | null = null;
  metaUserRank: { rank?: number | null, level?: number | null, totalPlayers?: number | null } | null = null;
  private metaInterval: any;
  // music playlist count
  musicTodoCount: number | null = null;
  private musicInterval: any;
  // Array game stats
  arrayActivePlayers: number | null = null;
  arrayUserRank: { rank?: number | null, level?: number | null, totalPlayers?: number | null } | null = null;
  private arrayInterval: any;
  // Emulation stats
  emulationActivePlayers: number | null = null;
  private emulationInterval: any;
  // Social stats
  socialTotalPosts: number | null = null;
  private socialInterval: any;
  // Crawler stats
  crawlerIndexCount: number | null = null;
  private crawlerInterval: any;

  notificationsActive = true; // master flag to gate polling

  async ngOnInit() {
    this.navbarReady = true;

    setTimeout(() => {
      if (!this.notificationsActive) return;
      this.getNotifications();
      this.getBonesPlayerInfo();
      this.displayAppSelectionHelp();
    }, 100)
  }

  ngOnDestroy() {
    clearInterval(this.cryptoHubInterval);
    clearInterval(this.calendarInfoInterval);
    clearInterval(this.wordlerInfoInterval);
    clearInterval(this.notificationInfoInterval);
    clearInterval(this.enderInterval);
    clearInterval(this.nexusInterval);
    clearInterval(this.metaInterval);
    clearInterval(this.musicInterval);
    clearInterval(this.arrayInterval);
    clearInterval(this.emulationInterval);
    clearInterval(this.socialInterval);
    clearInterval(this.crawlerInterval);
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
    if (!this.notificationsActive) return;
    if (!this._parent || !this._parent.user || this._parent.user.id == 0) return;
    this.getCurrentWeatherInfo();
    this.getCalendarInfo();
    this.getCryptoHubInfo();
    this.getNewsCountInfo();
    this.getNotificationInfo();
    this.getWordlerStreakInfo();
    this.getEnderPlayerInfo();
    this.getNexusPlayerInfo();
    this.getMetaPlayerInfo();
    this.getMusicInfo();
    this.getArrayPlayerInfo();
    this.getEmulationPlayerInfo();
    this.getSocialInfo();
    this.getCrawlerInfo();
    this.getThemeInfo();

    this.notificationInfoInterval = setInterval(() => { if (this.notificationsActive) this.getNotificationInfo(); }, 20 * 1000); // every minute
    this.cryptoHubInterval = setInterval(() => { if (this.notificationsActive) this.getCryptoHubInfo(); }, 20 * 60 * 1000); // every 20 minutes
    this.calendarInfoInterval = setInterval(() => { if (this.notificationsActive) this.getCalendarInfo(); }, 20 * 60 * 1000); // every 20 minutes 
    this.wordlerInfoInterval = setInterval(() => { if (this.notificationsActive) this.getWordlerStreakInfo(); }, 60 * 60 * 1000); // every hour
    this.enderInterval = setInterval(() => { if (this.notificationsActive) this.getEnderPlayerInfo(); }, 60 * 1000); // every minute
    this.bonesInterval = setInterval(() => { if (this.notificationsActive) this.getBonesPlayerInfo(); }, 60 * 1000); // every minute
    this.nexusInterval = setInterval(() => { if (this.notificationsActive) this.getNexusPlayerInfo(); }, 60 * 1000); // every minute
    this.metaInterval = setInterval(() => { if (this.notificationsActive) this.getMetaPlayerInfo(); }, 60 * 1000); // every minute
    this.musicInterval = setInterval(() => { if (this.notificationsActive) this.getMusicInfo(); }, 60 * 60 * 1000); // every hour
    this.arrayInterval = setInterval(() => { if (this.notificationsActive) this.getArrayPlayerInfo(); }, 60 * 1000); // every minute
    this.emulationInterval = setInterval(() => { if (this.notificationsActive) this.getEmulationPlayerInfo(); }, 60 * 1000); // every minute
    this.socialInterval = setInterval(() => { if (this.notificationsActive) this.getSocialInfo(); }, 5 * 60 * 1000); // every 5 minutes
    this.crawlerInterval = setInterval(() => { if (this.notificationsActive) this.getCrawlerInfo(); }, 60 * 60 * 1000); // every hour
  }

  stopNotifications() {
    console.log("stopping notifcs")
    this.notificationsActive = false;
    clearInterval(this.notificationInfoInterval);
    clearInterval(this.cryptoHubInterval);
    clearInterval(this.calendarInfoInterval);
    clearInterval(this.wordlerInfoInterval);
    clearInterval(this.enderInterval);
    clearInterval(this.bonesInterval);
    clearInterval(this.nexusInterval);
    clearInterval(this.metaInterval);
    clearInterval(this.musicInterval);
    clearInterval(this.arrayInterval);
    clearInterval(this.emulationInterval);
    clearInterval(this.socialInterval);
    clearInterval(this.crawlerInterval);
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

    this.getNotifications();
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
          // Active friends online (last_seen within past 10 minutes to match isUserOnline logic)
          let activeFriends = 0;
          const uid = this._parent.user?.id ?? 0;
          if (uid > 0) {
            try {
              const activeFriendRes: any = await this.friendService.getActiveFriendCount(uid, 10);
              activeFriends = activeFriendRes?.count ?? 0;
            } catch { activeFriends = 0; }
          }

          if (numberOfChatNotifs) {
            if (currentChatNotifCount < numberOfChatNotifs) {
              this._parent.showNotification(`${numberOfChatNotifs - currentChatNotifCount} New chat message${numberOfChatNotifs > 1 ? 's' : ''}.`);
            }
            const suffix = activeFriends > 0 ? ` #${activeFriends}` : '';
            this._parent.navigationItems.filter(x => x.title == "Chat")[0].content = numberOfChatNotifs + suffix;
          } else {
            // If no chat notifications, show only active friends count if >0
            this._parent.navigationItems.filter(x => x.title == "Chat")[0].content = activeFriends > 0 ? `#${activeFriends}` : '';
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
      this.isBiWeeklyEvent(type, entryDate, today) ||
      this.isMonthlyEvent(type, entryDate, today) ||
      this.isBiMonthlyEvent(type, entryDate, today) ||
      this.isAnnualEvent(type, entryDate, today) ||
      type === 'daily';
  }

  // Simplified comparison functions
  private isSameDate = (d1: Date, d2: Date) => d1.toDateString() === d2.toDateString();
  private isWeeklyEvent = (type: string, d1: Date, d2: Date) => type === 'weekly' && d1.getDay() === d2.getDay();
  private isBiWeeklyEvent = (type: string, d1: Date, d2: Date) => {
    if (type !== 'biweekly') return false;
    if (d1.getDay() !== d2.getDay()) return false;
    const diffWeeks = Math.floor((d2.getTime() - d1.getTime()) / (7 * 24 * 60 * 60 * 1000));
    return diffWeeks % 2 === 0;
  }
  private isMonthlyEvent = (type: string, d1: Date, d2: Date) => type === 'monthly' && d1.getDate() === d2.getDate();
  private isBiMonthlyEvent = (type: string, d1: Date, d2: Date) => {
    if (type !== 'bimonthly') return false;
    const sameDay = d1.getDate() === d2.getDate();
    const lastDayFallback = this.isLastDayFallback(d1, d2);
    if (!sameDay && !lastDayFallback) return false;
    const yearsDiff = d2.getFullYear() - d1.getFullYear();
    const monthsDiff = yearsDiff * 12 + (d2.getMonth() - d1.getMonth());
    return monthsDiff % 2 === 0;
  }
  private isAnnualEvent = (type: string, d1: Date, d2: Date) =>
    ['milestone', 'annually', 'birthday', 'newyears', 'anniversary', 'christmas'].includes(type) &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  private isLastDayFallback(original: Date, target: Date): boolean {
    const lastDayTarget = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    return original.getDate() > lastDayTarget && target.getDate() === lastDayTarget;
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
        const nav = this._parent.navigationItems.find(x => x.title == "Crypto-Hub");
        if (nav) {
          const lines: string[] = [];
          if (tmpLocalProfitability > 0) {
            lines.push(this.shortenCount(tmpLocalProfitability * btcToCADRate) + (btcToCADRate != 1 ? '$' : ''));
          }
          lines.push(this.shortenCount(btcToCADRate) + '$');
          nav.content = lines.join('\n');
        }
      }
      this.isLoadingCryptoHub = false;
    } catch (error) {
      console.error('Error fetching Crypto Hub data:', error);
      this.isLoadingCryptoHub = false;
    }
  }

  private async getEnderPlayerInfo() {
    if (!this.notificationsActive) return;
    this.isLoadingEnder = true;
    try {
      const res: any = await this.enderService.getActivePlayers(2);
      if (!this.notificationsActive) return; // abort update if stopped mid-fetch
      this.enderActivePlayers = res?.count ?? null;
    } catch (e) {
      this.enderActivePlayers = null;
    }

    try {
      if (!this.notificationsActive) return;
      const userId = this._parent.user?.id ?? 0;
      if (userId) {
        const rankRes: any = await this.enderService.getUserRank(userId);
        if (!this.notificationsActive) return;
        if (rankRes && rankRes.hasHero) {
          this.enderUserRank = { rank: rankRes.rank ?? null, score: rankRes.score ?? null, totalPlayers: rankRes.totalPlayers ?? null };
        } else {
          this.enderUserRank = { rank: null, score: null, totalPlayers: rankRes?.totalPlayers ?? null };
        }
      }
    } catch (e) {
      this.enderUserRank = null;
    }
    if (!this.notificationsActive) return;
    if (this._parent?.navigationItems) {
      const enderNav = this._parent.navigationItems.find(x => x.title === 'Ender');
      if (enderNav) {
        const parts: string[] = [];
        if (this.enderActivePlayers != null) parts.push(this.enderActivePlayers.toString());
        if (this.enderUserRank?.rank != null) parts.push(`#${this.enderUserRank.rank}`);
        enderNav.content = parts.join('\n');
      }
    }
    this.isLoadingEnder = false;
  }

  private async getNexusPlayerInfo() {
    if (!this.notificationsActive) return;
    try {
      const res: any = await this.nexusService.getActivePlayers(2);
      if (!this.notificationsActive) return;
      this.nexusActivePlayers = res?.count ?? null;
    } catch (e) {
      this.nexusActivePlayers = null;
    }
    try {
      if (!this.notificationsActive) return;
      const userId = this._parent.user?.id ?? 0;
      if (userId) {
        const rankRes: any = await this.nexusService.getUserRank(userId);
        if (!this.notificationsActive) return;
        if (rankRes && rankRes.hasBase) {
          this.nexusUserRank = { rank: rankRes.rank ?? null, baseCount: rankRes.baseCount ?? null, totalPlayers: rankRes.totalPlayers ?? null };
        } else {
          this.nexusUserRank = { rank: null, baseCount: null, totalPlayers: rankRes?.totalPlayers ?? null };
        }
      }
    } catch (e) {
      this.nexusUserRank = null;
    }
    if (!this.notificationsActive) return;
    if (this._parent?.navigationItems) {
      const nexusNav = this._parent.navigationItems.find(x => x.title === 'Bug-Wars');
      if (nexusNav) {
        const parts: string[] = [];
        if (this.nexusActivePlayers != null) parts.push(this.nexusActivePlayers.toString());
        if (this.nexusUserRank?.rank != null) parts.push(`#${this.nexusUserRank.rank}`);
        nexusNav.content = parts.join('\n');
      }
    }
  }

  private async getBonesPlayerInfo() {
    if (!this.notificationsActive) return;
    this.isLoadingEnder = true; // reuse loading flag for shared UI state
    try {
      const res: any = await this.bonesService.getActivePlayers(2);
      if (!this.notificationsActive) return;
      this.bonesActivePlayers = res?.count ?? null;
    } catch (e) {
      this.bonesActivePlayers = null;
    }

    try {
      if (!this.notificationsActive) return;
      const userId = this._parent.user?.id ?? 0;
      if (userId) {
        const rankRes: any = await this.bonesService.getUserRank(userId);
        if (!this.notificationsActive) return;
        if (rankRes && rankRes.hasHero) {
          this.bonesUserRank = { rank: rankRes.rank ?? null, level: rankRes.level ?? null, totalPlayers: rankRes.totalPlayers ?? null };
        } else {
          this.bonesUserRank = { rank: null, level: null, totalPlayers: rankRes?.totalPlayers ?? null };
        }
      }
    } catch (e) {
      this.bonesUserRank = null;
    }

    if (!this.notificationsActive) return;
    if (this._parent?.navigationItems) {
      const bonesNav = this._parent.navigationItems.find(x => x.title === 'Bones');
      if (bonesNav) {
        const parts: string[] = [];
        if (this.bonesActivePlayers != null) parts.push(this.bonesActivePlayers.toString());
        if (this.bonesUserRank?.rank != null) parts.push(`#${this.bonesUserRank.rank}`);
        bonesNav.content = parts.join('\n');
      }
    }
    this.isLoadingEnder = false;
  }

  private async getMetaPlayerInfo() {
    try {
      const res: any = await this.metaService.getActivePlayers(2);
      this.metaActivePlayers = res?.count ?? null;
    } catch (e) {
      this.metaActivePlayers = null;
    }
    try {
      const userId = this._parent.user?.id ?? 0;
      if (userId) {
        const rankRes: any = await this.metaService.getUserRank(userId);
        if (rankRes && rankRes.hasBot) {
          this.metaUserRank = { rank: rankRes.rank ?? null, level: rankRes.level ?? null, totalPlayers: rankRes.totalPlayers ?? null };
        } else {
          this.metaUserRank = { rank: null, level: null, totalPlayers: rankRes?.totalPlayers ?? null };
        }
      }
    } catch (e) {
      this.metaUserRank = null;
    }
    // Update Meta-Bots nav item content
    if (this._parent?.navigationItems) {
      const metaNav = this._parent.navigationItems.find(x => x.title === 'Meta-Bots');
      if (metaNav) {
        const parts: string[] = [];
        if (this.metaActivePlayers != null) parts.push(this.metaActivePlayers.toString());
        if (this.metaUserRank?.rank != null) parts.push(`#${this.metaUserRank.rank}`);
        metaNav.content = parts.join('\n');
      }
    }
  }

  private async getMusicInfo() {
    if (!this._parent?.user?.id) return;
    try {
      const res: any = await this.todoService.getTodoCount(this._parent.user.id, 'Music');
      this.musicTodoCount = res?.count ?? 0;
    } catch {
      this.musicTodoCount = null;
    }
    if (this._parent?.navigationItems) {
      const musicNav = this._parent.navigationItems.find(x => x.title === 'Music');
      if (musicNav) {
        musicNav.content = this.musicTodoCount && this.musicTodoCount > 0 ? this.shortenCount(this.musicTodoCount) : '';
      }
    }
  }

  private async getArrayPlayerInfo() {
    try {
      const res: any = await this.arrayService.getActivePlayers(2);
      this.arrayActivePlayers = res?.count ?? null;
    } catch { this.arrayActivePlayers = null; }
    try {
      const userId = this._parent.user?.id ?? 0;
      if (userId) {
        const rankRes: any = await this.arrayService.getUserRank(userId);
        if (rankRes && rankRes.hasHero) {
          this.arrayUserRank = { rank: rankRes.rank ?? null, level: rankRes.level ?? null, totalPlayers: rankRes.totalPlayers ?? null };
        } else {
          this.arrayUserRank = { rank: null, level: null, totalPlayers: rankRes?.totalPlayers ?? null };
        }
      }
    } catch { this.arrayUserRank = null; }
    if (this._parent?.navigationItems) {
      const arrayNav = this._parent.navigationItems.find(x => x.title === 'Array');
      if (arrayNav) {
        const parts: string[] = [];
        if (this.arrayActivePlayers != null) parts.push(this.arrayActivePlayers.toString());
        if (this.arrayUserRank?.rank != null) parts.push(`#${this.arrayUserRank.rank}`);
        arrayNav.content = parts.join('\n');
      }
    }
  }

  private async getEmulationPlayerInfo() {
    try {
      const res: any = await this.romService.getActivePlayers(2);
      this.emulationActivePlayers = res?.count ?? null;
    } catch { this.emulationActivePlayers = null; }
    if (this._parent?.navigationItems) {
      const emuNav = this._parent.navigationItems.find(x => x.title === 'Emulation');
      if (emuNav) {
        emuNav.content = this.emulationActivePlayers != null ? this.emulationActivePlayers.toString() : '';
      }
    }
  }

  private async getSocialInfo() {
    try {
      const res: any = await this.socialService.getTotalPosts();
      this.socialTotalPosts = res?.count ?? null;
    } catch { this.socialTotalPosts = null; }
    if (this._parent?.navigationItems) {
      const socialNav = this._parent.navigationItems.find(x => x.title === 'Social');
      if (socialNav) {
        socialNav.content = this.socialTotalPosts != null ? this.socialTotalPosts.toString() : '';
      }
    }
  }

  private async getCrawlerInfo() {
    try {
      const res: any = await this.crawlerService.indexCount();
      const parsed = parseInt(res, 10);
      this.crawlerIndexCount = !isNaN(parsed) ? parsed : null;
    } catch { this.crawlerIndexCount = null; }
    if (this._parent?.navigationItems) {
      const crawlerNav = this._parent.navigationItems.find(x => x.title === 'Crawler');
      if (crawlerNav) {
        crawlerNav.content = this.crawlerIndexCount != null ? this.crawlerIndexCount.toString() : '';
      }
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
    return this._parent.navigationItemDescriptions.some((x: MenuItem) => x.title == item);
  }
  closeNotifications() {
    this.isLoadingCryptoHub = false;
    this.isLoadingNotifications = false;
    this.isLoadingTheme = false;
    this.isLoadingWordlerStreak = false;
    this.isLoadingCalendar = false;
  }

  private async getNewsCountInfo() {
    if (!this._parent || !this._parent.user || this.navbarCollapsed) return;
    try {
      const count = await this.newsService.getNewsCount();
      if (this._parent?.navigationItems) {
        const newsNav = this._parent.navigationItems.find(x => x.title === 'News');
        if (newsNav) {
          newsNav.content = count && count > 0 ? this.shortenCount(count) : '';
        }
      }
    } catch (err) {
      console.error('Error fetching news count:', err);
    }
  }
  private shortenCount(value: number): string {
    if (value === null || value === undefined) return '';
    const num = value;
    const trillion = 1_000_000_000_000;
    const billion = 1_000_000_000;
    const million = 1_000_000;
    const thousand = 1_000;
    const format = (n: number, suffix: string) => (n).toFixed(2).replace(/\.0+$/, '').replace(/(\.[0-9]*[1-9])0+$/, '$1') + suffix;
    if (num >= trillion) return format(num / trillion, 'T');
    if (num >= billion) return format(num / billion, 'B');
    if (num >= million) return format(num / million, 'M');
    if (num >= thousand) return format(num / thousand, 'K');
    return num.toFixed(0);
  }
}