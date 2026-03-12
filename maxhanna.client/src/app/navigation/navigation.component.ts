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
import { UserTheme } from '../../services/datacontracts/chat/chat-theme';

@Component({
  selector: 'app-navigation',
  templateUrl: './navigation.component.html',
  styleUrl: './navigation.component.css',
  standalone: false
})
export class NavigationComponent implements OnInit, OnDestroy {
  @ViewChild('navbar') navbar!: ElementRef<HTMLElement>;
  @ViewChild('toggleNavButton') toggleNavButton!: ElementRef<HTMLElement>;

  @Input() user?: User;

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
  // Array game stats
  arrayActivePlayers: number | null = null;
  arrayUserRank: { rank?: number | null, level?: number | null, totalPlayers?: number | null } | null = null;
  private arrayInterval: any;
  // Emulator stats
  emulatorActivePlayers: number | null = null;  
  // Social stats
  socialTotalPosts: number | null = null; 
  // Art stats
  artTotalSubmissions: number | null = null; 
  // Crawler stats
  crawlerIndexCount: number | null = null; 
  private time20Secs = 20 * 1000;
  private time60Secs = 60 * 1000; 
  private time20Mins = 20 * 60 * 1000;
  private time60Mins = 60 * 60 * 1000;

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
  isLoadingBones = false;
  isLoadingNexus = false;
  isLoadingEmulator = false;
  isLoadingMeta = false;
  isLoadingArray = false;
  isLoadingMusic = false;
  isLoadingNews = false;
  isLoadingSocial = false;
  isLoadingCrawler = false;
  isLoadingArt = false;
  isLoadingWeather = false;
  isThemeApplied = false;
  numberOfNotifications = 0;
  showAppSelectionHelp = false;
  preventFetchNotifs = false;
  consecutiveNotificationFetchFailures = 0;
  notificationsServerDown = false;
  notificationTimeoutMs = 30 * 1000; // 30 seconds
  private notificationServerCheckInterval: any;
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
    private newsService: NewsService) { }

  async ngOnInit() {
    this.navbarReady = true; 
    if (this._parent?.user?.id) {
      this.getThemeInfo().catch(() => {});
    } else {
      this.applyDefaultTheme();
    }
    this.isThemeApplied = true;
    setTimeout(() => {
      if (this._parent.notificationsActive) return;
      this.getNotifications();
      this.displayAppSelectionHelp();
    }, 100)
  }

  ngOnDestroy() {
    console.log("destroying navbar, stopping notifications");
    this.showAppSelectionHelp = false;
    this.stopNotifications();
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
    if (this.notificationsServerDown) return; // when server down for notifications, skip fetching
    if (this._parent.notificationsActive || this.preventFetchNotifs) return;
    if (!this._parent || !this._parent.user || this._parent.user.id == 0) return;
    console.log("fetch notifications");
    this._parent.notificationsActive = true;

    const tasks: Promise<unknown>[] = [
      Promise.resolve(this.getCurrentWeatherInfo()),
      Promise.resolve(this.getCalendarInfo()),
      Promise.resolve(this.getCryptoHubInfo()),
      Promise.resolve(this.getNewsCountInfo()),
      Promise.resolve(this.getNotificationInfo()),
      Promise.resolve(this.getWordlerStreakInfo()),
      Promise.resolve(this.getEnderPlayerInfo()),
      Promise.resolve(this.getNexusPlayerInfo()),
      Promise.resolve(this.getMetaPlayerInfo()),
      Promise.resolve(this.getMusicInfo()),
      Promise.resolve(this.getArrayPlayerInfo()),
      Promise.resolve(this.getEmulatorPlayerInfo()),
      Promise.resolve(this.getSocialInfo()),
      Promise.resolve(this.getArtInfo()),
      Promise.resolve(this.getCrawlerInfo()),
      Promise.resolve(this.getThemeInfo()),
      Promise.resolve(this.getBonesPlayerInfo())
    ].map(p =>
      // Isolate failures so one error doesn't prevent others
      p.catch(err => {
        console.error('Concurrent task failed:', err);
      })
    );

    await Promise.allSettled(tasks);

    // If notifications were paused, shift last-run timestamps forward by the paused duration
    if (this._parent.notificationsPausedAt) {
      const pausedDuration = Date.now() - this._parent.notificationsPausedAt;
      try {
        for (const k of Object.keys(this._parent.lastRunTimestamps)) {
          this._parent.lastRunTimestamps[k] = (this._parent.lastRunTimestamps[k] ?? 0) + pausedDuration;
        }
      } catch (e) {
        console.error('Error adjusting lastRunTimestamps after pause', e);
      }
      this._parent.notificationsPausedAt = null;
    }

    // Schedule recurring tasks using scheduler that accounts for elapsed pause time
    this.scheduleRecurring('notificationInfo', () => { if (this._parent.notificationsActive) this.getNotificationInfo(); }, this.time20Secs);
    this.scheduleRecurring('weatherInfo', () => { if (this._parent.notificationsActive) this.getCurrentWeatherInfo(); }, this.time20Mins);
    this.scheduleRecurring('cryptoHub', () => { if (this._parent.notificationsActive) this.getCryptoHubInfo(); }, this.time20Mins);
    this.scheduleRecurring('calendarInfo', () => { if (this._parent.notificationsActive) this.getCalendarInfo(); }, this.time20Mins);
    this.scheduleRecurring('wordler', () => { if (this._parent.notificationsActive) this.getWordlerStreakInfo(); }, this.time60Mins);
    this.scheduleRecurring('ender', () => { if (this._parent.notificationsActive) this.getEnderPlayerInfo(); }, this.time60Secs);
    this.scheduleRecurring('bones', () => { if (this._parent.notificationsActive) this.getBonesPlayerInfo(); }, this.time60Secs);
    this.scheduleRecurring('nexus', () => { if (this._parent.notificationsActive) this.getNexusPlayerInfo(); }, this.time60Secs);
    this.scheduleRecurring('meta', () => { if (this._parent.notificationsActive) this.getMetaPlayerInfo(); }, this.time60Secs);
    this.scheduleRecurring('music', () => { if (this._parent.notificationsActive) this.getMusicInfo(); }, this.time60Mins);
    this.scheduleRecurring('array', () => { if (this._parent.notificationsActive) this.getArrayPlayerInfo(); }, this.time60Secs);
    this.scheduleRecurring('emulation', () => { if (this._parent.notificationsActive) this.getEmulatorPlayerInfo(); }, this.time60Secs);
    this.scheduleRecurring('social', () => { if (this._parent.notificationsActive) this.getSocialInfo(); }, this.time60Mins);
    this.scheduleRecurring('art', () => { if (this._parent.notificationsActive) this.getArtInfo(); }, this.time60Mins);
    this.scheduleRecurring('crawler', () => { if (this._parent.notificationsActive) this.getCrawlerInfo(); }, this.time60Mins);
    this.scheduleRecurring('newsCount', () => { if (this._parent.notificationsActive) this.getNewsCountInfo(); }, this.time60Mins);
  }

  stopNotifications() {
    try {
      console.log("stopping notifs")
      this._parent.notificationsActive = false;
      this._parent.notificationsPausedAt = Date.now();
      this.preventFetchNotifs = true;
      setTimeout(() => {
        this.preventFetchNotifs = false;
      }, 5000);

      // clear any active timers/timeouts/intervals
      this.clearAllNotificationTimers();
    } catch (error) {
      console.error('Error stopping notifications:', error);
    }
  }

  private clearAllNotificationTimers() {
    try {
      for (const k of Object.keys(this._parent.notificationTimers)) {
        const t = this._parent.notificationTimers[k];
        if (t.timeout) { clearTimeout(t.timeout); }
        if (t.interval) { clearInterval(t.interval); }
      }
    } catch (e) {
      console.error('Error clearing notification timers', e);
    }
 
    this._parent.notificationTimers = {};
  }

  // Schedule a recurring task that accounts for elapsed time since the last run.
  // If the task is overdue, it will run immediately and then at normal intervals.
  private scheduleRecurring(key: string, fn: () => void, intervalMs: number) {
    // clear existing timers for key
    const existing = this._parent.notificationTimers[key];
    if (existing) {
      if (existing.timeout) clearTimeout(existing.timeout);
      if (existing.interval) clearInterval(existing.interval);
    }

    const last = this._parent.lastRunTimestamps.hasOwnProperty(key) ? this._parent.lastRunTimestamps[key] : undefined;
    const now = Date.now();

    // If we've never run this task before, schedule first run after a full interval (do not run immediately)
    if (last === undefined || last === 0) {
      const to = setTimeout(() => {
        try { fn(); } catch (e) { console.error(e); }
        this.updateLastRunTimestamp(key);
        const iv = setInterval(() => { try { fn(); } catch (e) { console.error(e); } this.updateLastRunTimestamp(key); }, intervalMs);
        this._parent.notificationTimers[key] = { interval: iv };
      }, intervalMs);
      this._parent.notificationTimers[key] = { timeout: to };
      return;
    }

    const since = now - last;
    const remaining = intervalMs - since;

    if (remaining <= 0) {
      try { fn(); } catch (e) { console.error(e); }
      this.updateLastRunTimestamp(key);
      const iv = setInterval(() => { try { fn(); } catch (e) { console.error(e); } this.updateLastRunTimestamp(key); }, intervalMs);
      this._parent.notificationTimers[key] = { interval: iv };
    } else {
      const to = setTimeout(() => {
        try { fn(); } catch (e) { console.error(e); }
        this.updateLastRunTimestamp(key);
        const iv = setInterval(() => { try { fn(); } catch (e) { console.error(e); } this.updateLastRunTimestamp(key); }, intervalMs);
        this._parent.notificationTimers[key] = { interval: iv };
      }, remaining);
      this._parent.notificationTimers[key] = { timeout: to };
    }
  }

  private debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
    let timeout: any;
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  debouncedRestartNotifications = this.debounce(() => {
    if (this.navbarCollapsed) {
      return;
    }

    this.getNotifications();
  }, 5000);

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
    if (this._parent.lastRunTimestamps['notificationInfo'] 
      && Date.now() - this._parent.lastRunTimestamps['notificationInfo'] < this.time20Secs) 
    {
      return;
    }
    this.isLoadingNotifications = true;
    try {
      // race the notification fetch against a timeout to detect slow or hung server
      const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), this.notificationTimeoutMs));
      const res = await Promise.race([
        this.notificationService.getNotifications(this._parent.user.id ?? 0) as Promise<UserNotification[]>,
        timeoutPromise
      ]) as UserNotification[];

      // If fetch succeeded after previously being marked server-down, recover
      if (this.notificationsServerDown) {
        this.resetNotificationsServerDown();
      }

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
      // treat timeout or repeated errors as server-down for notifications
      this.consecutiveNotificationFetchFailures++;
      if (this.consecutiveNotificationFetchFailures >= 1 && !this.notificationsServerDown) {
        this.announceNotificationsServerDown();
      }
    }
    this.isLoadingNotifications = false;
    this.updateLastRunTimestamp('notificationInfo');
  }

  private announceNotificationsServerDown() {
    this.closeNotifications();
    this.clearNotifications();
    this.stopNotifications();
    this.notificationsServerDown = true;
    this.preventFetchNotifs = true; 
    // show server down message in UI and as a transient notification
    try { this._parent.showNotification('Server down'); } catch (e) { }

    // start periodic check to see when server is back up
    if (this.notificationServerCheckInterval) clearInterval(this.notificationServerCheckInterval);
    this.notificationServerCheckInterval = setInterval(async () => {
      try {
        const up = await this._parent?.isServerUp();
        if (up && up > 0) {
          this.preventFetchNotifs = false;
          this.resetNotificationsServerDown();
          // resume fetching
          this.debouncedRestartNotifications();
        }
      } catch (e) {
        // ignore and keep polling
      }
    }, 10000);
  }

  private resetNotificationsServerDown() {
    const wasDown = !!this.notificationsServerDown;
    this.notificationsServerDown = false;
    this.preventFetchNotifs = false;
    this.consecutiveNotificationFetchFailures = 0;
    if (this.notificationServerCheckInterval) { clearInterval(this.notificationServerCheckInterval); this.notificationServerCheckInterval = null; }
    return wasDown;
  }

  async getThemeInfo(userId?: number) {
    if (!userId && this._parent.lastRunTimestamps['theme'] && Date.now() - this._parent.lastRunTimestamps['theme'] < this.time20Mins) {
      console.log('Theme info fetched recently, skipping fetch');
      return;
    }
    if (!userId && this.isThemeApplied) {
      console.log('Theme already applied, skipping fetch');
      return;
    }
    if (!this._parent?.user?.id && !userId) {
      this.applyDefaultTheme();
      return;
    }
    this.isLoadingTheme = true;
    try {
      const theme = await this.userService.getTheme(userId ?? this._parent?.user?.id ?? 0);
      if (theme) {
        this.applyThemeToCSS(theme);
      } else {
        this.applyDefaultTheme();
      }
    } catch (error) {
      console.error('Error fetching theme data:', error);
    }
    this.isLoadingTheme = false;
    this.updateLastRunTimestamp('theme');
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
    if (this._parent.lastRunTimestamps['calendarInfo'] 
      && Date.now() - this._parent.lastRunTimestamps['calendarInfo'] < this.time20Mins) {
      return;
    }
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
      this.updateLastRunTimestamp('calendarInfo');
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
    if (this._parent.lastRunTimestamps['weatherInfo'] 
        && Date.now() - this._parent.lastRunTimestamps['weatherInfo'] < this.time20Mins) 
    {
      return;
    }
    if (!this._parent.user?.id || !this._parent.userSelectedNavigationItems.find(x => x.title == "Weather")) { return; }
    this.isLoadingWeather = true;
    try {
      const res = await this.weatherService.getWeather(this._parent.user.id);
      if (res?.current.condition.icon && res?.current.condition.icon.includes('weatherapi')) {
        this._parent.navigationItems.filter(x => x.title == "Weather")[0].content = res?.current.temp_c.toString() + "°C";
        this._parent.navigationItems.filter(x => x.title == "Weather")[0].icon = res.current.condition.icon;
      } else {
        this._parent.navigationItems.filter(x => x.title == "Weather")[0].content = "?";
      }
    } catch (error) {
      console.error('Error fetching weather data:', error);
    }
    this.isLoadingWeather = false;
    this.updateLastRunTimestamp('weatherInfo');
  }

  async getCryptoHubInfo() {
    if (this._parent.lastRunTimestamps['cryptoHub'] 
      && (Date.now() - this._parent.lastRunTimestamps['cryptoHub'] < this.time20Mins)) 
    {
      return;
    }
    const nav = this._parent.navigationItems.find(x => x.title === "Crypto-Hub");
    const isCHSelected = this._parent.userSelectedNavigationItems.find(x => x.title === "Crypto-Hub") ? true : false;
    const userId = this._parent?.user?.id;

    if (!isCHSelected || !nav || !userId) {
      if (!isCHSelected) { console.error("No CryptoHub selected in nav."); }
      if (!nav) { console.error("No nav to modify."); }
      if (!userId) { console.error("No user logged in."); }
      return;
    }

    try {
      let tmpLocalProfitability = 0;
      this.isLoadingCryptoHub = true;
      const res1 = await this.miningService.getMiningRigInfo(userId) as Array<MiningRig>;
      res1?.forEach(x => {
        tmpLocalProfitability += x.localProfitability!;
      });

      await this.coinValueService.isBTCRising().then(res => {
        this.isBTCRising = (Boolean)(res);
      });
      const userCurrency = await this.coinValueService.getUserCurrency(userId) ?? "CAD";
      let latestCurrencyPriceRespectToCAD = 1;
      const ceRes = await this.coinValueService.getLatestCurrencyValuesByName(userCurrency) as ExchangeRate;
      if (ceRes) {
        latestCurrencyPriceRespectToCAD = ceRes.rate;
      }
      const result = await this.coinValueService.getLatestCoinValuesByName("Bitcoin");
      if (result) {
        const btcToCADRate = result.valueCAD * latestCurrencyPriceRespectToCAD;
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
      this.updateLastRunTimestamp('cryptoHub');
    } catch (error) {
      console.error('Error fetching Crypto Hub data:', error);
      this.isLoadingCryptoHub = false;
    }
  }

  private async getEnderPlayerInfo() {
    if (this._parent.lastRunTimestamps['ender'] 
      && Date.now() - this._parent.lastRunTimestamps['ender'] < this.time60Secs) {
      return;
    }
    if (!this._parent.notificationsActive) {
      clearInterval(this.enderInterval);
      return;
    }
    this.isLoadingEnder = true;
    try {
      const res: any = await this.enderService.getActivePlayers(2);
      this.enderActivePlayers = res?.count ?? null;
    } catch (e) {
      this.enderActivePlayers = null;
    }

    try {
      const userId = this._parent.user?.id ?? 0;
      if (userId) {
        const rankRes: any = await this.enderService.getUserRank(userId);
        if (rankRes && rankRes.hasHero) {
          this.enderUserRank = { rank: rankRes.rank ?? null, score: rankRes.score ?? null, totalPlayers: rankRes.totalPlayers ?? null };
        } else {
          this.enderUserRank = { rank: null, score: null, totalPlayers: rankRes?.totalPlayers ?? null };
        }
      }
    } catch (e) {
      this.enderUserRank = null;
    }
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
    this.updateLastRunTimestamp('ender');
  }

  private async getNexusPlayerInfo() {
    if (!this._parent.notificationsActive) {
      clearInterval(this.nexusInterval);
      return;
    }
    if (this._parent.lastRunTimestamps['nexus'] 
      && Date.now() - this._parent.lastRunTimestamps['nexus'] < this.time60Secs) {
      return;
    }
    this.isLoadingNexus = true;
    try {
      const res: any = await this.nexusService.getActivePlayers(2);
      this.nexusActivePlayers = res?.count ?? null;
    } catch (e) {
      this.nexusActivePlayers = null;
    }
    try {
      const userId = this._parent.user?.id ?? 0;
      if (userId) {
        const rankRes: any = await this.nexusService.getUserRank(userId);
        if (rankRes && rankRes.hasBase) {
          this.nexusUserRank = { rank: rankRes.rank ?? null, baseCount: rankRes.baseCount ?? null, totalPlayers: rankRes.totalPlayers ?? null };
        } else {
          this.nexusUserRank = { rank: null, baseCount: null, totalPlayers: rankRes?.totalPlayers ?? null };
        }
      }
    } catch (e) {
      this.nexusUserRank = null;
    }
    if (this._parent?.navigationItems) {
      const nexusNav = this._parent.navigationItems.find(x => x.title === 'Bug-Wars');
      if (nexusNav) {
        const parts: string[] = [];
        if (this.nexusActivePlayers != null) parts.push(this.nexusActivePlayers.toString());
        if (this.nexusUserRank?.rank != null) parts.push(`#${this.nexusUserRank.rank}`);
        nexusNav.content = parts.join('\n');
      }
    }
    this.isLoadingNexus = false;
    this.updateLastRunTimestamp('nexus');
  }

  private async getBonesPlayerInfo() {
    if (!this._parent.notificationsActive) {
      clearInterval(this.bonesInterval);
      return;
    }
    if (this._parent.lastRunTimestamps['bones'] 
      && Date.now() - this._parent.lastRunTimestamps['bones'] < this.time60Secs) {
      return;
    }
    this.isLoadingBones = true;
    try {
      const res: any = await this.bonesService.getActivePlayers(2);
      this.bonesActivePlayers = res?.count ?? null;
    } catch (e) {
      this.bonesActivePlayers = null;
    }

    try {
      const userId = this._parent.user?.id ?? 0;
      if (userId) {
        const rankRes: any = await this.bonesService.getUserRank(userId);
        if (rankRes && rankRes.hasHero) {
          this.bonesUserRank = { rank: rankRes.rank ?? null, level: rankRes.level ?? null, totalPlayers: rankRes.totalPlayers ?? null };
        } else {
          this.bonesUserRank = { rank: null, level: null, totalPlayers: rankRes?.totalPlayers ?? null };
        }
      }
    } catch (e) {
      this.bonesUserRank = null;
    }

    if (this._parent?.navigationItems) {
      const bonesNav = this._parent.navigationItems.find(x => x.title === 'Bones');
      if (bonesNav) {
        const parts: string[] = [];
        if (this.bonesActivePlayers != null) parts.push(this.bonesActivePlayers.toString());
        if (this.bonesUserRank?.rank != null) parts.push(`#${this.bonesUserRank.rank}`);
        bonesNav.content = parts.join('\n');
      }
    }
    this.isLoadingBones = false;
    this.updateLastRunTimestamp('bones');
  }

  private async getMetaPlayerInfo() {
    if (!this._parent.notificationsActive) {
      clearInterval(this.metaInterval);
      return;
    } 
    if (this._parent.lastRunTimestamps['meta'] 
      && Date.now() - this._parent.lastRunTimestamps['meta'] < this.time60Secs) {
      return;
    }
    this.isLoadingMeta = true;
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
    if (this._parent?.navigationItems) {
      const metaNav = this._parent.navigationItems.find(x => x.title === 'Meta-Bots');
      if (metaNav) {
        const parts: string[] = [];
        if (this.metaActivePlayers != null) parts.push(this.metaActivePlayers.toString());
        if (this.metaUserRank?.rank != null) parts.push(`#${this.metaUserRank.rank}`);
        metaNav.content = parts.join('\n');
      }
    }
    this.isLoadingMeta = false;
    this.updateLastRunTimestamp('meta');
  }

  private async getMusicInfo() {
    if (!this._parent.notificationsActive) return;
    if (!this._parent?.user?.id) return;
    if (this._parent.lastRunTimestamps['music'] 
      && Date.now() - this._parent.lastRunTimestamps['music'] < this.time60Mins) {
      return;
    }
    this.isLoadingMusic = true;
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
    this.isLoadingMusic = false;
    this.updateLastRunTimestamp('music');
  }

  private async getArrayPlayerInfo() {
    if (!this._parent.notificationsActive) {
      clearInterval(this.arrayInterval);
      return;
    }
    if (this._parent.lastRunTimestamps['array'] 
      && Date.now() - this._parent.lastRunTimestamps['array'] < this.time60Secs) {
      return;
    }
    this.isLoadingArray = true;
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
    this.isLoadingArray = false;
    this.updateLastRunTimestamp('array');
  }

  private async getEmulatorPlayerInfo() {
    if (!this._parent.notificationsActive) return;
    if (this._parent.lastRunTimestamps['emulator']
      && Date.now() - this._parent.lastRunTimestamps['emulator'] < this.time60Secs) {
      return;
    }
    this.isLoadingEmulator = true;
    try {
      const res: any = await this.romService.getActivePlayers(2);
      this.emulatorActivePlayers = res?.count ?? null;
    } catch { this.emulatorActivePlayers = null; }
    if (this._parent?.navigationItems) {
      const emuNav = this._parent.navigationItems.find(x => x.title === 'Emulator');
      if (emuNav) {
        emuNav.content = this.emulatorActivePlayers != null ? this.emulatorActivePlayers.toString() : '';
      }
    }
    this.isLoadingEmulator = false;
    this.updateLastRunTimestamp('emulator');
  }

  private async getSocialInfo() {
    if (!this._parent.notificationsActive) return;
    if (this._parent.lastRunTimestamps['social'] 
      && Date.now() - this._parent.lastRunTimestamps['social'] < this.time60Mins) {
      return;
    }
    this.isLoadingSocial = true;
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
    this.isLoadingSocial = false;
    this.updateLastRunTimestamp('social');
  }

  private async getCrawlerInfo() {
    if (!this._parent.notificationsActive) return;
    if (this._parent.lastRunTimestamps['crawler']
      && Date.now() - this._parent.lastRunTimestamps['crawler'] < this.time60Mins) {
      return;
    }
    this.isLoadingCrawler = true;
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
    this.isLoadingCrawler = false;
    this.updateLastRunTimestamp('crawler');
  }

  private async getArtInfo() {
    if (!this._parent.notificationsActive) return;
    if (this._parent.lastRunTimestamps['art'] 
      && Date.now() - this._parent.lastRunTimestamps['art'] < this.time60Mins) {
      return;
    }
    this.isLoadingArt = true;
    if (!this.artTotalSubmissions) {
      try {
        const res: any = await this.fileService.getNumberOfArt();
        this.artTotalSubmissions = res ?? 0;
      } catch {
        this.artTotalSubmissions = null;
      }
    }
    if (this._parent?.navigationItems) {
      const artNav = this._parent.navigationItems.find(x => x.title === 'Art');
      if (artNav) {
        artNav.content = this.artTotalSubmissions != null ? this.artTotalSubmissions.toString() : '';
      }
    }
    this.isLoadingArt = false;
    this.updateLastRunTimestamp('art');
  }

  async getWordlerStreakInfo() {
    if (!this._parent.notificationsActive) return;
    if (this._parent.lastRunTimestamps['wordler'] 
      && Date.now() - this._parent.lastRunTimestamps['wordler'] < this.time60Mins) {
      return;
    }
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
    this.updateLastRunTimestamp('wordler');
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
      this._parent.createComponent(title, { inputtedParentRef: this._parent, areSelectableMenuItemsExplained: true, showOnlySelectableMenuItems: true });
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
      this._parent.currentComponent = '';
    }
    this.debouncedRestartNotifications();
  }

  updateLastRunTimestamp(key: string) {
    this._parent.lastRunTimestamps[key] = Date.now();
  }

  applyThemeToCSS(theme: UserTheme) {
    if (theme.backgroundImage) {
      const requesterId = this._parent?.user?.id;
      this.fileService.getFileEntryById(theme.backgroundImage.id, requesterId).then(res => {
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
    this.isLoadingBones = false;
    this.isLoadingEnder = false; 
    this.isLoadingNexus = false;
    this.isLoadingMeta = false;
    this.isLoadingEmulator = false;
    this.isLoadingSocial = false;
    this.isLoadingCrawler = false;
    this.isLoadingArt = false;
    this.isLoadingArray = false;
    this.isLoadingMusic = false;
    this.isLoadingWeather = false;
    this.isLoadingNews = false;
    this.notificationsServerDown = false;
  }

  private async getNewsCountInfo() {
    if (this._parent.lastRunTimestamps['newsCount']
        && Date.now() - this._parent.lastRunTimestamps['newsCount'] < this.time60Mins) {
      return;
    }
    if (!this._parent || !this._parent.user || this.navbarCollapsed) return;
    this.isLoadingNews = true;
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
    this.isLoadingNews = false;
    this.updateLastRunTimestamp('newsCount');
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