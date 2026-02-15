import { Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { MenuItem } from '../../services/datacontracts/user/menu-item';
import { MiningService } from '../../services/mining.service';
import { WeatherService } from '../../services/weather.service';
import { UserService } from '../../services/user.service';
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
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging } from "firebase/messaging";

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
  isBlockedUsersToggled = false;
  isDeleteAccountToggled = false;
  isBTCWalletAddressesToggled = false;
  isAboutToggled = false;
  showAddBTCWalletAddressInput = false;
  isApiKeysToggled = false;
  showOnlyApiKeys = false;
  selectableIcons: MenuItem[] = [];
  btcWalletAddresses?: string[];
  notifications: string[] = [];
  selectedCurrency = '';
  uniqueCurrencyNames: string[] = [];
  blockedUsers: User[] = [];
  hasNhApiKeys?: boolean;
  hasKrakenKeys?: boolean;
  displayPictureFile?: FileEntry = this.parentRef?.user?.displayPictureFile;
  profileBackgroundPictureFile?: FileEntry = this.parentRef?.user?.profileBackgroundPictureFile;
  expandedIconTitle: string | null = null;

  isKrakenHelpPanelShowing = false;
  isDisplayingNSFW = false;
  isPushNotificationsEnabled? = false;
  isSecurityQuestionsToggled = false;
  cachedSecurityQuestions?: Array<{ question: string; answer?: string }> = undefined;
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
  @ViewChild('nsfwCheckmark') nsfwCheckmark!: ElementRef<HTMLInputElement>;
  @ViewChild('pushNotificationsCheckmark') pushNotificationsCheckmark!: ElementRef<HTMLInputElement>;

  @ViewChild('updatedEmail') updatedEmail!: ElementRef<HTMLInputElement>;
  @ViewChild('updatedWebsite') updatedWebsite!: ElementRef<HTMLInputElement>;
  @ViewChild('isEmailPublicYes') isEmailPublicYes!: ElementRef<HTMLInputElement>;
  @ViewChild('isEmailPublicNo') isEmailPublicNo!: ElementRef<HTMLInputElement>;
  @ViewChild('updatedPhone') updatedPhone!: ElementRef<HTMLInputElement>;
  @ViewChild('updatedBirthday') updatedBirthday!: ElementRef<HTMLInputElement>;
  @ViewChild('updatedDescription') updatedDescription!: ElementRef<HTMLInputElement>;
  @ViewChild('selectedCurrencyDropdown') selectedCurrencyDropdown!: ElementRef<HTMLSelectElement>;

  @ViewChild(MediaSelectorComponent) displayPictureSelector!: MediaSelectorComponent;
  @ViewChild(MediaViewerComponent) displayPictureViewer!: MediaViewerComponent;


  constructor(private miningService: MiningService, private tradeService: TradeService, private weatherService: WeatherService, private userService: UserService, private coinService: CoinValueService, private notificationService: NotificationService) {
    super();
  }
  async ngOnInit() {
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
          this.isDisplayingNSFW = res.nsfwEnabled ?? false;
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
      if (res) {
        if (user && parent) {
          user.about = about;
          parent.resetUserCookie();
          this.ngOnInit();
          this.parentRef?.showNotification(res);
        }
      }
    });
  }
  async updateKrakenAPIKeys() {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = parent?.user;
    if (this.isApiKeysToggled && user) {
      const krakenPrivateKey = this.krakenPrivateKey.nativeElement.value;
      const krakenApiKey = this.krakenApiKey.nativeElement.value;
      if (krakenPrivateKey && krakenApiKey) {
        const minValidLength = 30;
        const invalidFields = [];
        if (krakenPrivateKey.length < minValidLength) invalidFields.push('Private Key');
        if (krakenApiKey.length < minValidLength) invalidFields.push('API Key');

        if (invalidFields.length > 0) {
          return alert(`The following Kraken API fields are too short (minimum ${minValidLength} characters):\n\n${invalidFields.join('\n')}`);
        }

        try {
          parent?.getSessionToken().then(sessionToken => {
            this.tradeService.updateApiKey(user.id ?? 0, krakenApiKey, krakenPrivateKey, sessionToken).then(res => {
              if (res) {
                this.parentRef?.showNotification(res);
                setTimeout(() => { this.ngOnInit(); }, 50);
              }
            });
          });
        } catch (error) {
          console.log(error);
        }
      }
      else if ((krakenApiKey && !krakenPrivateKey) || (!krakenApiKey && krakenPrivateKey)) {
        return alert("Incomplete Kraken API key entry. Fill in both API and Private Key values to save.");
      }
    }
  }
  async updateNHAPIKeys() {
    const user = this.parentRef?.user;
    if (this.isApiKeysToggled && user?.id) {
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
          return alert(`The following Nicehash API fields are too short (minimum ${minValidLength} characters):\n\n${invalidFields.join('\n')}`);
        }
        try {
          await this.miningService.updateNicehashApiInfo(user.id, keys);
          this.parentRef?.showNotification("Nicehash API Keys updated successfully");
          setTimeout(() => { this.ngOnInit(); }, 50);
        } catch {
          this.parentRef?.showNotification("Error while updating Nicehash API Keys!");
        }
      } else if ((!keys.orgId || !keys.apiKey || !keys.apiSecret) && (keys.orgId || keys.apiKey || keys.apiSecret)) {
        return alert("Incomplete Nicehash API key entry. Fill in All 3 API key, Org ID and API Secret values to save.");
      }
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
            const locationData = await this.parentRef.getLocation();
            if (locationData) {
              const weatherLocation = await this.weatherService.getWeatherLocation(this.parentRef.user.id) as WeatherLocation;
              if (weatherLocation && (this.userService.isValidIpAddress(weatherLocation.location) || weatherLocation.location?.trim() === '')) {
                await this.weatherService.updateWeatherLocation(this.parentRef.user.id, locationData.ip, locationData.city, locationData.country);
              }
            }
          }
        }

        this.parentRef?.showNotification("Weather location updated successfully");
      } catch {
        this.parentRef?.showNotification("Error while updating weather location!");
      }
      this.ngOnInit();
    }
  }

  async profileBackgroundSelected(files: FileEntry[]) {
    const targetParent = this.inputtedParentRef ?? this.parentRef;
    if (files && files.length > 0 && targetParent?.user?.id) {
      await this.userService.updateProfileBackgroundPicture(targetParent.user.id, files[0].id);
      targetParent.user.profileBackgroundPictureFile = files[0];
      targetParent.deleteCookie("user");
      targetParent.setCookie("user", JSON.stringify(targetParent.user), 10);
      this.ngOnInit();
    }
  }

  async avatarSelected(files: FileEntry[]) {
    const targetParent = this.inputtedParentRef ?? this.parentRef;
    if (files && files.length > 0 && targetParent?.user?.id) {
      await this.userService.updateDisplayPicture(targetParent.user.id, files[0].id);
      targetParent.user.displayPictureFile = files[0];
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
    parent.user = await this.userService.login(username, password);
    this.stopLoading();
  }

  async deleteUser() {
    const parent = this.parentRef ?? this.inputtedParentRef;
    if (!parent) return alert("Parent cannot be null"); 
    const sessionToken = await parent.getSessionToken();
    if (parent.user?.id) {
      if (confirm("Are you sure you wish to delete your account? This will also delete all your saved data, chats, etc.")) { 
        try {
          const res = await this.userService.deleteUser(parent.user?.id ?? 0, sessionToken);
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
            if (x.address) {
              this.btcWalletAddresses?.push(x.address);
            }
          });
        }
      });
    }
  }
  async updateNSFW() {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = parent?.user;
    if (!user || !user.id) return alert("You must be logged in to view NSFW content.");
    const isChecked = this.nsfwCheckmark.nativeElement.checked;
    this.userService.updateNSFW(user.id, isChecked).then(res => {
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
      // onMessage(this.messaging, (payload: any) => {
      //   const parent = this.inputtedParentRef ?? this.parentRef;
      //   const body = payload.notification.body;
      //   const title = payload.notification.title;
      //   parent?.showNotification(`${title}: ${body}`);
      // });

      console.log('Current Notification Permission:', Notification.permission);
      if (this.isPushNotificationsEnabled == undefined) {
        if (Notification.permission === 'default') {
          const permission = await Notification.requestPermission();
          if (permission === "granted") {
            const token = await getToken(this.messaging, { vapidKey: "BOdqEEb-xWiCvKqILbKr92U6ETC3O0SmpbpAtulpvEqNMMRq79_0JidqqPgrzOLDo_ZnW3Xh7PNMwzP9uBQSCyA" });
            await this.subscribeToNotificationTopic(token);
            this.userService.updateNotificationsEnabled(parent.user.id, true);
          } else {
            console.log('User declined notification permission');
            this.userService.updateNotificationsEnabled(parent.user.id, false);
          }
        } else if (Notification.permission === 'granted') {
          const token = await getToken(this.messaging, { vapidKey: "BOdqEEb-xWiCvKqILbKr92U6ETC3O0SmpbpAtulpvEqNMMRq79_0JidqqPgrzOLDo_ZnW3Xh7PNMwzP9uBQSCyA" });
          await this.subscribeToNotificationTopic(token);
          this.userService.updateNotificationsEnabled(parent.user.id, true);
        } else {
          console.log('User denied notification permission');
          this.userService.updateNotificationsEnabled(parent.user.id, false);
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

    // If we already have a frontend copy, use it and avoid reloading.
    if (this.cachedSecurityQuestions && this.cachedSecurityQuestions.length > 0) {
      // Wait for DOM to render inputs
      setTimeout(() => { this.populateSecurityQuestionInputs(this.cachedSecurityQuestions); }, 0);
      return;
    }

    // Wait for DOM to render the inputs and then load from server once
    setTimeout(async () => {
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
    if (this.previousComponent) {
      this.parentRef?.createComponent(this.previousComponent);
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
    this.userService.updateNotificationsEnabled(this.parentRef.user.id, this.isPushNotificationsEnabled).then(res => {
      this.parentRef?.showNotification(res);
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
