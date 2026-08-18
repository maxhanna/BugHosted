import { Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { MenuItem } from '../../services/datacontracts/user/menu-item';
import { MiningService } from '../../services/mining.service';
import { WeatherService } from '../../services/weather.service';
import { UserService } from '../../services/user.service';
import { SessionVault } from '../../services/session-vault.service';
import { ChildComponent } from '../child.component';
import { NicehashApiKeys } from '../../services/datacontracts/crypto/nicehash-api-keys';
import { MediaViewerComponent } from '../media-viewer/media-viewer.component';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { UserAbout } from '../../services/datacontracts/user/user-about';
import { WeatherLocation } from '../../services/datacontracts/weather/weather-location';
import { User } from '../../services/datacontracts/user/user';
import { MediaSelectorComponent } from '../media-selector/media-selector.component';
import { AppComponent } from '../app.component';
import { MiningWalletResponse } from '../../services/datacontracts/crypto/mining-wallet-response';
import { CoinValueService } from '../../services/coin-value.service';
import { TradeService } from '../../services/trade.service';
import { UserSettings } from '../../services/datacontracts/user/user-settings';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-update-user-settings',
  templateUrl: './update-user-settings.component.html',
  styleUrl: './update-user-settings.component.css',
  standalone: false
})
export class UpdateUserSettingsComponent extends ChildComponent implements OnInit {
  updateUserDivVisible = true;
  isGeneralToggled = false;
  isMenuIconsToggled = false;
  isWeatherLocationToggled = false;
  // True while the browser is fetching a precise GPS position for the Detect
  // button — shows a spinner on the button and blocks double-clicks.
  detectingLocation = false;
  isBlockedUsersToggled = false;
  isDeleteAccountToggled = false;
  isSessionsToggled = false;
  activeSessions: any[] = [];
  isBTCWalletAddressesToggled = false;
  isPushNotificationsToggled = false;
  isAboutToggled = false;
  showAddBTCWalletAddressInput = false;
  isApiKeysToggled = false;
  showOnlyApiKeys = false;
  showOnlyAccountSection = false;
  selectableIcons: MenuItem[] = [];
  // Search box for the App Selection (menu icons) section — filters the app
  // list live by title/icon so users can find a menu item fast.
  menuSearchQuery = '';
  btcWalletAddresses?: string[];
  notifications: string[] = [];
  selectedCurrency = '';
  uniqueCurrencyNames: string[] = [];
  blockedUsers: User[] = [];
  hasNhApiKeys?: boolean;
  hasKrakenKeys?: boolean;
  displayPictureFile?: FileEntry;
  profileBackgroundPictureFile?: FileEntry;
  expandedIconTitle: string | null = null;
  isProfilePicturesToggled = false;
  isKrakenHelpPanelShowing = false;
  isDisplayingNSFW = false;
  isPushNotificationsEnabled? = false;
  followPushEnabled = true;
  followEmailEnabled = false;
  isSecurityQuestionsToggled = false;
  showAddBlockedUserPopup = false;
  cachedSecurityQuestions?: Array<{ question: string; answer?: string }> = undefined;
  displayProfileLocation = true;
  // Mirrors the 'show_nav_search' user setting — discoverable here in Settings
  // as well as via the 🔍 toggle on the navigation page itself.
  showNavSearch = true;
  // IANA timezone id of the browser, used so calendar notifications fire
  // relative to the user's local clock rather than the server's.
  timezone = '';
  isTimezoneToggled = false;
  userSettings: UserSettings | null = null;
  app?: any;
  messaging?: any;

  @Input() inputtedParentRef?: AppComponent;
  @Input() showOnlySelectableMenuItems? = false;
  @Input() showOnlyWeatherLocation? = false;
  @Input() showOnlyKrakenApiKeys? = false;
  @Input() showOnlyNicehashApiKeys? = false;
  @Input() areSelectableMenuItemsExplained? = false;

  @ViewChild('updatedUsername') updatedUsername!: ElementRef<HTMLInputElement>;
  @ViewChild('updatedPassword') updatedPassword!: ElementRef<HTMLInputElement>;
  @ViewChild('orgId') orgId!: ElementRef<HTMLInputElement>;
  @ViewChild('apiKey') apiKey!: ElementRef<HTMLInputElement>;
  @ViewChild('apiSecret') apiSecret!: ElementRef<HTMLInputElement>;
  @ViewChild('krakenApiKey') krakenApiKey!: ElementRef<HTMLInputElement>;
  @ViewChild('krakenPrivateKey') krakenPrivateKey!: ElementRef<HTMLInputElement>;
  @ViewChild('weatherLocationCityInput') weatherLocationCityInput!: ElementRef<HTMLInputElement>;
  @ViewChild('weatherLocationCountryInput') weatherLocationCountryInput!: ElementRef<HTMLInputElement>;
  @ViewChild('displayProfileLocationCheckmark') displayProfileLocationCheckmark!: ElementRef<HTMLInputElement>;
  @ViewChild('navSearchCheckmark') navSearchCheckmark!: ElementRef<HTMLInputElement>;
  @ViewChild('nsfwCheckmark') nsfwCheckmark!: ElementRef<HTMLInputElement>;
  @ViewChild('pushNotificationsCheckmark') pushNotificationsCheckmark!: ElementRef<HTMLInputElement>;

  @ViewChild('updatedEmail') updatedEmail!: ElementRef<HTMLInputElement>;
  @ViewChild('updatedWebsite') updatedWebsite!: ElementRef<HTMLInputElement>;
  @ViewChild('isEmailPublicYes') isEmailPublicYes!: ElementRef<HTMLInputElement>;
  @ViewChild('isEmailPublicNo') isEmailPublicNo!: ElementRef<HTMLInputElement>;
  @ViewChild('updatedPhone') updatedPhone!: ElementRef<HTMLInputElement>;
  @ViewChild('updatedBirthday') updatedBirthday!: ElementRef<HTMLInputElement>;
  @ViewChild('weeklyDigestCheckbox') weeklyDigestCheckbox!: ElementRef<HTMLInputElement>;
  @ViewChild('updatedDescription') updatedDescription!: ElementRef<HTMLInputElement>;
  @ViewChild('selectedCurrencyDropdown') selectedCurrencyDropdown!: ElementRef<HTMLSelectElement>;

  @ViewChild('displayPictureSelector') displayPictureSelector!: MediaSelectorComponent;
  @ViewChild('profileBackgroundPictureSelector') profileBackgroundPictureSelector!: MediaSelectorComponent;
  @ViewChild(MediaViewerComponent) displayPictureViewer!: MediaViewerComponent;


  constructor(private miningService: MiningService, private tradeService: TradeService, private weatherService: WeatherService, private userService: UserService, private coinService: CoinValueService, private notificationService: NotificationService) {
    super();
  }
  async ngOnInit() {
    if (this.inputtedParentRef) {
      this.parentRef = this.inputtedParentRef;
    }
    this.selectableIcons = this.parentRef!.navigationItems
      .filter(x => x.title !== 'Close Menu' && x.title !== 'User' && x.title !== 'UpdateUserSettings')
      .sort((a, b) => a.title.localeCompare(b.title));

    this.updateUserDivVisible = true;
    this.isGeneralToggled = false;
    this.isMenuIconsToggled = false;
    this.isWeatherLocationToggled = false;
    this.isBlockedUsersToggled = false;
    this.isDeleteAccountToggled = false;
    this.isAboutToggled = false;
    this.isApiKeysToggled = this.showOnlyNicehashApiKeys ?? false;
    this.isApiKeysToggled = this.showOnlyKrakenApiKeys ?? false;

    const user = this.inputtedParentRef?.user ?? this.parentRef?.user;
    if (user?.id) {
      this.userService.getUserSettings(user.id).then(res => {
        if (res) {
          this.userSettings = res;
          this.isDisplayingNSFW = res.nsfwEnabled ?? false;
          this.displayProfileLocation = res.displayProfileLocation ?? true;
          this.followPushEnabled = res.followPushEnabled ?? true;
          this.followEmailEnabled = res.followEmailEnabled ?? false;
          this.showNavSearch = res.showNavSearch ?? true;
          this.timezone = res.timezone ?? '';
          if (this.displayProfileLocationCheckmark?.nativeElement) {
            this.displayProfileLocationCheckmark.nativeElement.checked = this.displayProfileLocation;
          }
          if (this.navSearchCheckmark?.nativeElement) {
            this.navSearchCheckmark.nativeElement.checked = this.showNavSearch;
          }
        }
      });
    }
    if (user) {
      this.userService.getUserSettings(user.id ?? 0).then((res?: UserSettings) => {
        if (res) {
          this.isPushNotificationsEnabled = res.notificationsEnabled;
          if (this.isPushNotificationsEnabled == undefined || this.isPushNotificationsEnabled) {
            this.requestNotificationPermission();
          }
        }
      })
    }

    this.getUniqueCurrencyNames();

    if (this.showOnlyWeatherLocation) {
      this.isWeatherLocationToggled = true;
      this.getWeatherLocation();
    }

    // Preload current display/profile background files so media selector reflects existing selection
    this.displayPictureFile = user?.displayPictureFile ?? undefined;
    this.profileBackgroundPictureFile = user?.profileBackgroundPictureFile ?? undefined;
  }
  async getNicehashApiKeys() {
    const user = this.parentRef?.user;
    if (this.isApiKeysToggled && user?.id) {
      this.hasNhApiKeys = await this.miningService.getNicehashApiInfo(user.id);
    }
  }
  async getKrakenApiKeys() {
    if (this.isApiKeysToggled && this.parentRef?.user?.id && this.parentRef.user.id != 0) {
      this.hasKrakenKeys = await this.tradeService.hasApiKey(this.parentRef.user.id);
    }
  }
  async deleteNicehashApiKeys() {
    if (!confirm("Are you sure?")) return;
    const user = this.parentRef?.user;
    if (this.isApiKeysToggled && user?.id) {
      this.hasNhApiKeys = false;
      await this.miningService.deleteNicehashApiInfo(user.id).then((res) => {
        this.inputtedParentRef?.showNotification(res);
        this.orgId.nativeElement.value = '';
        this.apiKey.nativeElement.value = '';
        this.apiSecret.nativeElement.value = '';
      });
    }
  }
  async deleteKrakenApiKeys() {
    if (!confirm("Are you sure?")) return;
    const user = this.parentRef?.user;
    if (this.isApiKeysToggled && user?.id) {
      this.hasKrakenKeys = false;
      await this.miningService.deleteKrakenApiInfo(user.id).then((res) => {
        this.inputtedParentRef?.showNotification(res);
        this.krakenPrivateKey.nativeElement.value = '';
        this.krakenApiKey.nativeElement.value = '';
      });
    }
  }
  async blockedUserSelected(user?: User) {
    if (!this.parentRef?.user?.id) {
      alert("You must be logged in to block users!");
      return;
    }
    if (!user) {
      alert("No user selected!");
      return;
    }
    if (user.id == this.parentRef.user.id) {
      alert("You cannot block yourself!");
      return;
    }
    if (!confirm(`Are you sure you want to block ${user.username}? This will prevent them from interacting with you.`)) {
      return;
    }
    this.startLoading();
    await this.userService.blockUser(this.parentRef?.user?.id ?? 0, user.id ?? 0).then(res => {
      if (res) { 
        this.parentRef?.showNotification(res);
      }
      this.stopLoading();
    });
  }
  async getUniqueCurrencyNames() {
    try {
      const res = await this.coinService.getUniqueCurrencyNames() as string[];
      if (res) {
        this.uniqueCurrencyNames = res;
      }
    } catch (error) {
      console.error('Error fetching currency values:', error);
      this.uniqueCurrencyNames = [];
    }
  }
  async updateUserAbout() {
    const parent = this.inputtedParentRef ? this.inputtedParentRef : this.parentRef;
    const user = parent?.user; 
    if (!user?.id) return;

    this.startLoading();
    let about = new UserAbout();
    about.userId = user.id;
    about.description = this.updatedDescription.nativeElement.value != '' ? this.updatedDescription.nativeElement.value : undefined;
    about.phone = this.updatedPhone.nativeElement.value != '' ? this.updatedPhone.nativeElement.value : undefined;
    about.email = this.updatedEmail.nativeElement.value != '' ? this.updatedEmail.nativeElement.value : undefined;
    about.isEmailPublic = this.isEmailPublicYes.nativeElement.checked ? true : false;
    about.birthday = this.updatedBirthday.nativeElement.value != '' ? new Date(this.updatedBirthday.nativeElement.value) : undefined;
    about.currency = this.selectedCurrencyDropdown.nativeElement.value != '' ? this.selectedCurrencyDropdown.nativeElement.value : undefined;
    about.website = this.updatedWebsite && this.updatedWebsite.nativeElement.value != '' ? this.updatedWebsite.nativeElement.value : undefined;
    await this.userService.updateUserAbout(user.id, about).then(async res => {
      this.stopLoading();
      if (res) {
        if (user && parent) {
          user.about = about;
          parent.resetUserCookie();
          this.ngOnInit();
          this.parentRef?.showNotification(res); 
        }
      }
    });
    await this.userService.updateUserSettings(user.id, [
      { settingName: 'weekly_digest_enabled', value: this.weeklyDigestCheckbox.nativeElement.checked }
    ]);
  }
  async updateKrakenAPIKeys() {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = parent?.user;
    if (this.isApiKeysToggled && user) {
      this.startLoading();
      const krakenPrivateKey = this.krakenPrivateKey.nativeElement.value;
      const krakenApiKey = this.krakenApiKey.nativeElement.value;
      if (krakenPrivateKey && krakenApiKey) {
        const minValidLength = 30;
        const invalidFields = [];
        if (krakenPrivateKey.length < minValidLength) invalidFields.push('Private Key');
        if (krakenApiKey.length < minValidLength) invalidFields.push('API Key');

        if (invalidFields.length > 0) {
          this.stopLoading();
          return alert(`The following Kraken API fields are too short (minimum ${minValidLength} characters):\n\n${invalidFields.join('\n')}`);
        }

        try {
          parent?.getSessionToken().then(sessionToken => {
            this.tradeService.updateApiKey(user.id ?? 0, krakenApiKey, krakenPrivateKey, sessionToken).then(res => {
              this.stopLoading();
              if (res) {
                this.parentRef?.showNotification(res);
                setTimeout(() => { this.ngOnInit(); }, 50);
              }
            });
          });
        } catch (error) {
          this.stopLoading();
          console.log(error);
        }
      }
      else if ((krakenApiKey && !krakenPrivateKey) || (!krakenApiKey && krakenPrivateKey)) {
        this.stopLoading();
        return alert("Incomplete Kraken API key entry. Fill in both API and Private Key values to save.");
      }
    }
  }
  async updateNHAPIKeys() {
    const user = this.parentRef?.user;
    if (this.isApiKeysToggled && user?.id) {
      this.startLoading();
      let keys = new NicehashApiKeys();
      keys.orgId = this.orgId.nativeElement.value;
      keys.apiKey = this.apiKey.nativeElement.value;
      keys.apiSecret = this.apiSecret.nativeElement.value;
      keys.ownership = this.parentRef?.user!.id;

      if (keys.orgId && keys.apiKey && keys.apiSecret) {
        const minValidLength = 30;
        const invalidFields = [];
        if (keys.orgId.length < minValidLength) invalidFields.push('Organization ID');
        if (keys.apiSecret.length < minValidLength) invalidFields.push('API Secret');
        if (keys.apiKey.length < minValidLength) invalidFields.push('API Key');

        if (invalidFields.length > 0) {
          this.stopLoading();
          return alert(`The following Nicehash API fields are too short (minimum ${minValidLength} characters):\n\n${invalidFields.join('\n')}`);
        }
        try {
          await this.miningService.updateNicehashApiInfo(user.id, keys);
          this.stopLoading();
          this.parentRef?.showNotification("Nicehash API Keys updated successfully");
          setTimeout(() => { this.ngOnInit(); }, 50);
        } catch {
          this.parentRef?.showNotification("Error while updating Nicehash API Keys!");
          this.stopLoading();
        }
      } else if ((!keys.orgId || !keys.apiKey || !keys.apiSecret) && (keys.orgId || keys.apiKey || keys.apiSecret)) {
        return alert("Incomplete Nicehash API key entry. Fill in All 3 API key, Org ID and API Secret values to save.");
      }
    }
  }

  /** Uses the browser's GPS (HTML5 geolocation) to find the user's precise
   *  location, reverse-geocodes it to a city + country, and fills the City /
   *  Country inputs so they can press Save Location. Mirrors the sig-int
   *  getCurrentPosition pattern (high accuracy, 15s timeout). */
  detectLocation(): void {
    if (!this.parentRef?.user?.id || this.detectingLocation) return;
    if (!navigator.geolocation) {
      this.parentRef?.showNotification('Geolocation is not supported by this browser.');
      return;
    }
    this.detectingLocation = true;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const place = await this.reverseGeocode(lat, lon);
        // The section may have been collapsed while the GPS request was pending
        // (the *ngIf removes the inputs), so the ViewChilds can be undefined —
        // write defensively so the button never gets stuck on "Detecting…".
        const cityEl = this.weatherLocationCityInput?.nativeElement;
        const countryEl = this.weatherLocationCountryInput?.nativeElement;
        if (place && (place.city || place.country)) {
          if (cityEl) cityEl.value = place.city;
          if (countryEl) countryEl.value = place.country;
          this.parentRef?.showNotification(
            `Detected: ${place.city}${place.country ? ', ' + place.country : ''} (${lat.toFixed(4)}, ${lon.toFixed(4)}) — press Save Location to apply`
          );
        } else {
          this.parentRef?.showNotification(
            `Location found (${lat.toFixed(4)}, ${lon.toFixed(4)}) but couldn't resolve the city — type it in and press Save Location`
          );
        }
        this.detectingLocation = false;
      },
      (err) => {
        this.detectingLocation = false;
        const msg = err.code === err.PERMISSION_DENIED
          ? 'Location permission denied. Enable location access in your browser and try again.'
          : err.code === err.POSITION_UNAVAILABLE
            ? 'Location unavailable. Try again in a moment.'
            : 'Location request timed out. Try again.';
        this.parentRef?.showNotification(msg);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  }

  /** Reverse-geocodes a lat/lon pair to { city, country } via OpenStreetMap's
   *  Nominatim API. Returns null on any failure so the caller can fall back. */
  private async reverseGeocode(lat: number, lon: number): Promise<{ city: string; country: string } | null> {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`
      );
      if (!res.ok) return null;
      const data = await res.json();
      const a = data?.address;
      if (!a) return null;
      return {
        city: (a.city || a.town || a.village || a.municipality || a.county || '').trim(),
        country: (a.country || '').trim(),
      };
    } catch {
      return null;
    }
  }

  async getWeatherLocation() {
    if (this.isWeatherLocationToggled && this.parentRef?.user?.id) {
      const res = await this.weatherService.getWeatherLocation(this.parentRef.user.id);
      this.weatherLocationCountryInput.nativeElement.value = res.country;
      this.weatherLocationCityInput.nativeElement.value = res.city;
    }
  }

  async updateWeatherLocation() {
    if (this.isWeatherLocationToggled && this.parentRef?.user?.id) {
      try {
        const inputCityLoc = this.weatherLocationCityInput.nativeElement.value;
        const inputCountryLoc = this.weatherLocationCountryInput.nativeElement.value;
        if ((inputCityLoc && inputCityLoc.trim() != '') || (inputCountryLoc && inputCountryLoc.trim() != '')) {
          await this.weatherService.updateWeatherLocation(this.parentRef.user.id, inputCityLoc, inputCityLoc, inputCountryLoc);
        }
        else {
          if (this.parentRef?.user?.id) {
            this.startLoading();
            const locationData = await this.parentRef.getLocation();
            if (locationData) {
              const weatherLocation = await this.weatherService.getWeatherLocation(this.parentRef.user.id) as WeatherLocation;
              if (weatherLocation && (this.userService.isValidIpAddress(weatherLocation.location) || weatherLocation.location?.trim() === '')) {
                this.stopLoading();
                await this.weatherService.updateWeatherLocation(this.parentRef.user.id, locationData.ip, locationData.city, locationData.country);
              }
            }
          }
        }

        this.parentRef?.showNotification("Weather location updated successfully");
      } catch {
        this.parentRef?.showNotification("Error while updating weather location!");
        this.stopLoading();
      }
      this.ngOnInit();
    }
  }

  async profileBackgroundSelected(files: FileEntry[]) {
    const targetParent = this.inputtedParentRef ?? this.parentRef;
    if (targetParent?.user?.id) {
      this.startLoading();
      if (files && files.length > 0) {
        await this.userService.updateProfileBackgroundPicture(targetParent.user.id, files[0].id);
        this.stopLoading();
        targetParent.user.profileBackgroundPictureFile = files[0];
      } else {
        await this.userService.updateProfileBackgroundPicture(targetParent.user.id, 0);
        this.stopLoading();
        targetParent.user.profileBackgroundPictureFile = undefined as any;
      }
      targetParent.deleteCookie("user");
      targetParent.setCookie("user", JSON.stringify(targetParent.user), 10);
      this.ngOnInit();
    }
  }

  async avatarSelected(files: FileEntry[]) {
    const targetParent = this.inputtedParentRef ?? this.parentRef;
    if (targetParent?.user?.id) {
      this.startLoading();
      if (files && files.length > 0) {
        await this.userService.updateDisplayPicture(targetParent.user.id, files[0].id);
        this.stopLoading();
        targetParent.user.displayPictureFile = files[0];
      } else {
        // empty selection -> clear display picture
        await this.userService.updateDisplayPicture(targetParent.user.id, 0);
        this.stopLoading();
        targetParent.user.displayPictureFile = undefined as any;
      }
      targetParent.deleteCookie("user");
      targetParent.setCookie("user", JSON.stringify(targetParent.user), 10);
      this.ngOnInit();
    }
  }

  async updateUser() {
    const parent = this.parentRef ?? this.inputtedParentRef;
    const username = this.updatedUsername.nativeElement.value;
    const password = this.updatedPassword.nativeElement.value;
    if (!username) {
      return alert("Username cannot be empty!");
    }
    if (!parent) return alert("Parent cannot be null");
    const currUser = JSON.parse(parent.getCookie("user")) as User;
    const tmpUser = new User(currUser.id, username, password);
    this.startLoading();
    try {
      const sessionToken = await parent.getSessionToken();
      const res = await this.userService.updateUser(tmpUser, sessionToken);
      const message = res["message"];
      parent.setCookie("user", JSON.stringify(tmpUser), 10);
      parent.showNotification(message);
    } catch (error) {
      parent.showNotification(`Error updating user ${parent.user?.username}. Error: ${JSON.stringify(error)}`);
    }
    // Re-login after a username change to refresh the user object and mint a
    // fresh server session token.
    const loginData = await this.userService.login(username, password) as { user: User; sessionToken: string } | undefined;
    if (loginData?.user) {
      parent.user = loginData.user;
      // Server also sets the token as an HttpOnly cookie (not JS-readable).
      parent.sessionToken = loginData.sessionToken;
    }
    this.stopLoading();
  }

  async toggleSessions() {
    this.isSessionsToggled = !this.isSessionsToggled;
    if (this.isSessionsToggled) await this.refreshSessions();
  }

  async refreshSessions() {
    const parent = this.parentRef ?? this.inputtedParentRef;
    if (!parent) return;
    const sessionToken = await parent.getSessionToken();
    if (!sessionToken) { this.activeSessions = []; return; }
    this.activeSessions = (await this.userService.getSessions(sessionToken)) ?? [];
  }

  async revokeSession(sessionId: number, isCurrent: boolean) {
    const parent = this.parentRef ?? this.inputtedParentRef;
    if (!parent) return alert("Parent cannot be null");
    const sessionToken = await parent.getSessionToken();
    if (!sessionToken) return alert("You must be logged in first!");
    const prompt = isCurrent
      ? "This is the device you're on now. Revoking it will sign you out. Continue?"
      : "Revoke this session? That device will be signed out.";
    if (!confirm(prompt)) return;
    const ok = await this.userService.revokeSession(sessionId, sessionToken);
    if (ok) {
      parent.showNotification(isCurrent ? "This device was signed out." : "Session revoked.");
      if (isCurrent) {
        parent.sessionToken = "";
        SessionVault.clear();
        // The cookie is HttpOnly so JS can't clear it — the Logout endpoint
        // revokes the (already-deleted) session and clears it server-side.
        await this.userService.logout(sessionToken);
        window.location.reload();
      } else {
        await this.refreshSessions();
      }
    } else {
      parent.showNotification("Failed to revoke session.");
    }
  }

  formatSessionTime(value?: string): string {
    if (!value) return "—";
    const d = new Date(value);
    return isNaN(d.getTime()) ? "—" : d.toLocaleString();
  }

  /** Friendly device label + emoji for a session's stored User-Agent, so the
   *  Active Sessions panel shows what each device is ("Chrome on Windows",
   *  "Safari on iPhone", …) instead of an opaque token. */
  deviceLabel(ua?: string): { icon: string; name: string } {
    const s = (ua ?? '').toLowerCase();
    if (!s) return { icon: '💻', name: 'Unknown device' };
    let icon = '💻';
    let os = 'Computer';
    if (/iphone|ipod/.test(s)) { icon = '📱'; os = 'iPhone'; }
    else if (/ipad/.test(s)) { icon = '📱'; os = 'iPad'; }
    else if (/android/.test(s)) { icon = '📱'; os = 'Android'; }
    else if (/windows/.test(s)) { icon = '💻'; os = 'Windows'; }
    else if (/mac os|macintosh/.test(s)) { icon = '💻'; os = 'macOS'; }
    else if (/linux/.test(s)) { icon = '💻'; os = 'Linux'; }
    let browser = '';
    if (/edg(e|a)/.test(s)) browser = 'Edge';
    else if (/opr\/|opera/.test(s)) browser = 'Opera';
    else if (/chrome|crios/.test(s)) browser = 'Chrome';
    else if (/firefox|fxios/.test(s)) browser = 'Firefox';
    else if (/safari/.test(s)) browser = 'Safari';
    return { icon, name: browser ? `${browser} on ${os}` : os };
  }

  async deleteUser() {
    const parent = this.parentRef ?? this.inputtedParentRef;
    if (!parent) return alert("Parent cannot be null"); 
    const sessionToken = await parent.getSessionToken();
    if (parent.user?.id) {
      if (confirm("Are you sure you wish to delete your account? This will also delete all your saved data, chats, etc.")) { 
        try {
          this.startLoading();
          const res = await this.userService.deleteUser(parent.user?.id ?? 0, sessionToken);
          this.stopLoading();
          parent.showNotification(res["message"]);
          parent.deleteCookie("user");
          window.location.reload();
        } catch (error) {
          parent.showNotification(`Error deleting user ${parent.user?.username}`);
        }
      }
    } else { return alert("You must be logged in first!"); }
  }
  async getMenuIcons() {
    this.isMenuIconsToggled = !this.isMenuIconsToggled;

    if (this.isMenuIconsToggled) {
      const response = await this.userService.getUserMenu(this.parentRef?.user?.id);
      this.parentRef!.userSelectedNavigationItems = response;
    }
  }

  async selectMenuIcon(title: string) {
    const parent = this.inputtedParentRef ?? this.parentRef;

    if (parent && parent.userSelectedNavigationItems.some(x => x.title == title)) {
      parent.userSelectedNavigationItems = parent.userSelectedNavigationItems.filter(x => x.title != title);
      if (!parent.user || !parent.user.id) {
        parent.showNotification("You must be logged in to persist menu selections.");
      } else {
        this.userService.deleteMenuItem(parent.user.id, title).then(res => {
          if (res) {
            parent.showNotification(res);
          }
        });
      }
    } else if (parent) {
      parent.userSelectedNavigationItems!.push(new MenuItem(parent.user?.id ?? 0, title));
      if (!parent.user || !parent.user.id) {
        parent.showNotification("You must be logged in to persist menu selections.");
      } else if (parent && parent.user) {
        this.userService.addMenuItem(parent.user.id, [title]).then(res => {
          if (res) {
            parent.showNotification(res);
          }
        });
      }
    }
  }
  toggleIconDescription(title: string): void {
    this.expandedIconTitle = this.expandedIconTitle === title ? null : title;
  }
  menuIconsIncludes(title: string) {
    return this.parentRef!.userSelectedNavigationItems.some(x => x.title == title) || this.inputtedParentRef?.userSelectedNavigationItems.some(x => x.title == title);
  }
  // Case-insensitive live filter for the App Selection list, matching title,
  // icon, or the description text so apps are findable by any of them.
  getFilteredSelectableIcons(): MenuItem[] {
    const q = this.menuSearchQuery.trim().toLowerCase();
    if (!q) return this.selectableIcons;
    return this.selectableIcons.filter(icon =>
      (icon.title ?? '').toLowerCase().includes(q) ||
      (icon.icon ?? '').toLowerCase().includes(q) ||
      (this.parentRef?.getMenuItemDescription?.(icon.title) ?? '').toLowerCase().includes(q)
    );
  }

  formatDate(date?: Date | string | null): string {
    if (!date) return '';
    let d: Date;
    if (date instanceof Date) {
      d = date;
    } else {
      d = new Date(date);
    }
    if (isNaN(d.getTime())) return '';
    return d.toISOString().substring(0, 10);
  }
  
  menuInformationZoom(id: string) {
    if (document.getElementById(id) && this.parentRef) {
      const element = document.getElementById(id);
      if (this.parentRef && element) {
        document.getElementById(id + 'divdiv')?.classList.remove("ellipsis");
        this.parentRef.setModalBody(element.innerHTML);
      }
    }
  }
  addBTCWalletAddress() {
    this.showAddBTCWalletAddressInput = !this.showAddBTCWalletAddressInput;
  }
  async updateBTCWalletAddresses() {
    const user = this.parentRef?.user;
    if (!user?.id) {
      return alert("You must be logged in!");
    }

    const inputs = Array.from(document.getElementsByClassName("btcWalletInput")) as HTMLInputElement[];
    let wallets: string[] = [];

    // Bitcoin address validation regex
    const btcAddressRegex = /^(1|3|bc1)[a-zA-Z0-9]{25,42}$/;

    // Loop through each input and validate the wallet address
    for (let input of inputs) {
      const walletInfo = input.value;

      // Check if the wallet address is valid
      if (!btcAddressRegex.test(walletInfo)) {
        return alert(`Invalid Bitcoin address: ${walletInfo}. Please check for invalid characters.`);
      }

      // Add valid wallet address to the list
      wallets.push(walletInfo);
    }

    const sessionToken = await this.parentRef?.getSessionToken() ?? "";
    await this.coinService.updateBTCWalletAddresses(user.id, wallets, sessionToken);
    alert("BTC Wallet Addresses Updated. Visit the Crypto-Hub App To Track.");
  }

  async getBTCWalletAddresses() {
    if (this.btcWalletAddresses) return;
    const user = this.parentRef?.user;
    this.btcWalletAddresses = [];

    if (user && user.id) {
      const sessionToken = await this.parentRef?.getSessionToken() ?? "";
      this.coinService.getBTCWallet(user.id, sessionToken).then((res: MiningWalletResponse) => {
        if (res) {
          res?.currencies?.forEach(x => {
            if (x.address && x.address != 'Nicehash' && x.address != 'Kraken') {
              this.btcWalletAddresses?.push(x.address);
            }
          });
        }
      });
    }
  }

  async updateDisplayProfileLocation() {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = parent?.user;
    if (!user || !user.id) return alert("You must be logged in to save your settings.");
    const isChecked = this.displayProfileLocationCheckmark.nativeElement.checked;
    this.userService.updateUserSettings(user.id, [{ settingName: 'display_profile_location', value: isChecked }]).then(res => {
      if (res) {
        parent.showNotification(res);
      }
    });
  }

  async updateNavSearch() {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = parent?.user;
    if (!user || !user.id) return alert("You must be logged in to save your settings.");
    const isChecked = this.navSearchCheckmark.nativeElement.checked;
    this.showNavSearch = isChecked;
    this.userService.updateUserSettings(user.id, [{ settingName: 'show_nav_search', value: isChecked }]).then(res => {
      if (res) {
        parent.showNotification(res);
      }
    });
  }

  async updateTimezone() {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = parent?.user;
    if (!user || !user.id) return alert("You must be logged in to save your settings.");
    if (!this.timezone || !this.timezone.trim()) return alert("Enter a timezone (e.g. America/New_York) or use 📡 Detect.");
    this.timezone = this.timezone.trim();
    this.userService.updateUserSettings(user.id, [{ settingName: 'timezone', value: this.timezone }]).then(res => {
      if (res) {
        parent.showNotification(res);
      }
    });
  }

  detectTimezone(): void {
    try {
      const tz = (Intl.DateTimeFormat().resolvedOptions() as any).timeZone ?? '';
      if (!tz) {
        this.parentRef?.showNotification('Could not detect your timezone in this browser.');
        return;
      }
      this.timezone = tz;
      this.parentRef?.showNotification(`Detected timezone: ${tz} — press 💾 Save Timezone to keep it.`);
    } catch {
      this.parentRef?.showNotification('Could not detect your timezone in this browser.');
    }
  }
  
  async updateNSFW() {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = parent?.user;
    if (!user || !user.id) return alert("You must be logged in to view NSFW content.");
    const isChecked = this.nsfwCheckmark.nativeElement.checked;
    this.userService.updateUserSettings(user.id, [{ settingName: 'nsfw_enabled', value: isChecked }]).then(res => {
      if (res) {
        parent.showNotification(res);
      }
    });
  }
  async deleteBTCWalletAddress(address: string) {
    const user = this.parentRef?.user;
    if (user && user.id) {
      if (!confirm(`Delete BTC Wallet Address : ${address}?`)) return;

      const sessionToken = await this.parentRef?.getSessionToken() ?? "";
      await this.coinService.deleteBTCWalletAddress(user.id, address, sessionToken);
      const inputs = Array.from(document.getElementsByClassName("btcWalletInput")) as HTMLInputElement[];
      for (let input of inputs) {
        if (input.value == address) {
          input.value = "";
        }
      }
    }
  }
  async getBlockedUsers() {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = parent?.user;
    this.startLoading();
    if (user?.id) {
      this.userService.getBlockedUsers(user.id).then(res => {
        if (res) {
          this.blockedUsers = res;
        }
      });
    } else {
      this.blockedUsers = [];
    }
    this.stopLoading();
  }
  unblock(blockedUser: User) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = parent?.user;
    if (!user?.id || !blockedUser || !blockedUser.id) return;
    this.userService.unblockUser(user.id, blockedUser.id).then(res => {
      if (res) {
        parent?.showNotification(res);
        if (res.includes("successfully")) {
          this.blockedUsers = this.blockedUsers.filter(x => x.id != blockedUser.id);
        }
      }
    })
  }
  async requestNotificationPermission() {
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (!parent?.user || !parent.user.id) {
      return;
    }
    try {
      // Firebase is dynamically imported so the messaging SDK stays out of the
      // initial main.js bundle and loads only when push notifications are used.
      const { initializeApp } = await import('firebase/app');
      const { getMessaging, getToken } = await import('firebase/messaging');
      const firebaseConfig = {
        apiKey: "AIzaSyAR5AbDVyw2RmW4MCLL2aLVa2NLmf3W-Xc",
        authDomain: "bughosted.firebaseapp.com",
        projectId: "bughosted",
        storageBucket: "bughosted.firebasestorage.app",
        messagingSenderId: "288598058428",
        appId: "1:288598058428:web:a4605e4d8eea73eac137b9",
        measurementId: "G-MPRXZ6WVE9"
      };
      this.app = initializeApp(firebaseConfig);
      this.messaging = await getMessaging(this.app);  
      console.log('Current Notification Permission:', Notification.permission);
      if (this.isPushNotificationsEnabled == undefined) {
        if (Notification.permission === 'default') {
          const permission = await Notification.requestPermission();
          if (permission === "granted") {
            const token = await getToken(this.messaging, { vapidKey: "BOdqEEb-xWiCvKqILbKr92U6ETC3O0SmpbpAtulpvEqNMMRq79_0JidqqPgrzOLDo_ZnW3Xh7PNMwzP9uBQSCyA" });
            await this.subscribeToNotificationTopic(token);
            this.userService.updateUserSettings(parent.user.id, [{ settingName: 'notifications_enabled', value: true }]);
          } else {
            console.log('User declined notification permission');
            this.userService.updateUserSettings(parent.user.id, [{ settingName: 'notifications_enabled', value: false }]);
          }
        } else if (Notification.permission === 'granted') {
          const token = await getToken(this.messaging, { vapidKey: "BOdqEEb-xWiCvKqILbKr92U6ETC3O0SmpbpAtulpvEqNMMRq79_0JidqqPgrzOLDo_ZnW3Xh7PNMwzP9uBQSCyA" });
          await this.subscribeToNotificationTopic(token);
          this.userService.updateUserSettings(parent.user.id, [{ settingName: 'notifications_enabled', value: true }]);
        } else {
          console.log('User denied notification permission');
          this.userService.updateUserSettings(parent.user.id, [{ settingName: 'notifications_enabled', value: false }]);
        }
      } else {
        console.log("User has already enabled or disabled notifications.");
      }
    } catch (error) {
      console.log('Error requesting notification permission:', error);
    }
  }
  async saveSecurityQuestions() {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = parent?.user;
    if (!user || !user.id) return alert('You must be logged in to save security questions.');

    const qas: Array<{ question: string; answer: string }> = [];
    for (let i = 1; i <= 5; i++) {
      const qEl = document.getElementById('secretQuestion' + i) as HTMLInputElement | null;
      const aEl = document.getElementById('secretAnswer' + i) as HTMLInputElement | null;
      const q = qEl?.value?.trim() ?? '';
      const a = aEl?.value?.trim() ?? '';
      if (q && a) qas.push({ question: q, answer: a });
    }
    if (qas.length < 3) return alert('Please enter at least 3 question/answer pairs.');
    const sessionToken = await parent.getSessionToken();
    const res = await this.userService.saveSecurityQuestions(user.id, qas, sessionToken);
    parent.showNotification(res?.message ?? JSON.stringify(res));
    // Update frontend cache when save appears successful
    try {
      const success = !!res && !(res as any).error;
      if (success) {
        this.cachedSecurityQuestions = qas.map(x => ({ question: x.question }));
      }
    } catch { }
    this.ngOnInit();
  }

  private populateSecurityQuestionInputs(qas?: Array<{ question?: string }>) {
    for (let i = 0; i < 5; i++) {
      const qEl = document.getElementById('secretQuestion' + (i + 1)) as HTMLInputElement | null;
      const aEl = document.getElementById('secretAnswer' + (i + 1)) as HTMLInputElement | null;
      if (qEl) qEl.value = (qas && qas[i] && qas[i].question) ? (qas[i].question ?? '') : '';
      if (aEl) aEl.value = '';
    }
  }

  async toggleSecurityQuestions() {
    this.isSecurityQuestionsToggled = !this.isSecurityQuestionsToggled;
    if (!this.isSecurityQuestionsToggled) return;

    // Always wait for DOM to render inputs before populating
    setTimeout(async () => {
      if (this.cachedSecurityQuestions && this.cachedSecurityQuestions.length > 0) {
        this.populateSecurityQuestionInputs(this.cachedSecurityQuestions);
        return;
      }
      const id = this.inputtedParentRef?.user?.id ?? this.parentRef?.user?.id;
      if (!id) return;
      try {
        const res: any = await this.userService.getSecurityQuestionsByUserId(id);
        const qas = Array.isArray(res) ? res.map((x: any) => ({ question: x.question })) : [];
        this.cachedSecurityQuestions = qas;
        this.populateSecurityQuestionInputs(qas as any);
      } catch (err) {
        console.log('Error loading security questions', err);
      }
    }, 0);
  }

  async startPasswordResetWithQuestions() {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = parent?.user;
    if (!user || !user.id) return alert('You must be logged in to use this flow.');

    const answers: Array<{ index: number; answer: string }> = [];
    for (let i = 1; i <= 5; i++) {
      const aEl = document.getElementById('secretAnswer' + i) as HTMLInputElement | null;
      const a = aEl?.value?.trim() ?? '';
      if (a) answers.push({ index: i, answer: a });
    }
    if (answers.length < 3) return alert('Please answer at least 3 questions to proceed.');
    const res = await this.userService.verifySecurityQuestionsReset(user.id, answers);
    if (res && (res as any).message) {
      parent.showNotification((res as any).message);
      // clear user cookie or force re-login since password is blanked
      parent.deleteCookie('user');
      window.location.reload();
    } else {
      parent.showNotification('Verification failed.');
    }
  }
  private async subscribeToNotificationTopic(token: string) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent?.user?.id) {
      this.notificationService.subscribeToTopic(parent.user.id, token, "notification" + parent.user.id);
    }
  }
  closeThisComponent() {
    if (this.parentRef && this.parentRef.previousComponent.length > 1) {
      this.parentRef.goBack();
    }
    else if (!this.showOnlySelectableMenuItems) {
      this.parentRef?.createComponent('User');
    } else {
      this.remove_me('UpdateUserProfile');
    }
  }
  updatePushNotifications() {
    if (!this.parentRef?.user?.id) return;
    this.isPushNotificationsEnabled = this.pushNotificationsCheckmark.nativeElement.checked;
    this.userService.updateUserSettings(this.parentRef.user.id, [{ settingName: 'notifications_enabled', value: this.isPushNotificationsEnabled }]).then(res => {
      this.parentRef?.showNotification(res);
    });
  }
  updateFollowPush() {
    if (!this.parentRef?.user?.id) return;
    this.followPushEnabled = !this.followPushEnabled;
    this.userService.updateUserSettings(this.parentRef.user.id, [{ settingName: 'follow_notifications_push', value: this.followPushEnabled }]).then(res => {
      console.log('Follow push setting saved:', res);
    });
  }
  updateFollowEmail() {
    if (!this.parentRef?.user?.id) return;
    this.followEmailEnabled = !this.followEmailEnabled;
    this.userService.updateUserSettings(this.parentRef.user.id, [{ settingName: 'follow_notifications_email', value: this.followEmailEnabled }]).then(res => {
      console.log('Follow email setting saved:', res);
    });
  }
  showKrakenHelpPanel() {
    this.isKrakenHelpPanelShowing = true;
    const parent = this.inputtedParentRef ?? this.parentRef;
    parent?.showOverlay();
  }
  closeKrakenHelpPanel() {
    this.isKrakenHelpPanelShowing = false;
    const parent = this.inputtedParentRef ?? this.parentRef;
    parent?.closeOverlay();
  }
}
