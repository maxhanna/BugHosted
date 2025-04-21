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
  isNicehashApiKeysToggled = false;
  isKrakenApiKeysToggled = false;
  selectableIcons: MenuItem[] = [];
  btcWalletAddresses?: string[];
  notifications: string[] = [];
  selectedCurrency = '';
  uniqueCurrencyNames: string[] = [];
  blockedUsers: User[] = [];
  nhApiKeys?: NicehashApiKeys;
  hasKrakenKeys?: boolean;
  displayPictureFile?: FileEntry = this.parentRef?.user?.displayPictureFile;
  expandedIconTitle: string | null = null;

  isDisplayingNSFW = false;

  @Input() inputtedParentRef?: AppComponent;
  @Input() showOnlySelectableMenuItems? = true;
  @Input() showOnlyWeatherLocation? = false;
  @Input() showOnlyKrakenApiKeys? = false;
  @Input() showOnlyNicehashApiKeys? = false;
  @Input() areSelectableMenuItemsExplained? = true;
  @Input() previousComponent? = undefined;

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

  @ViewChild('updatedEmail') updatedEmail!: ElementRef<HTMLInputElement>;
  @ViewChild('isEmailPublicYes') isEmailPublicYes!: ElementRef<HTMLInputElement>;
  @ViewChild('isEmailPublicNo') isEmailPublicNo!: ElementRef<HTMLInputElement>;
  @ViewChild('updatedPhone') updatedPhone!: ElementRef<HTMLInputElement>;
  @ViewChild('updatedBirthday') updatedBirthday!: ElementRef<HTMLInputElement>;
  @ViewChild('updatedDescription') updatedDescription!: ElementRef<HTMLInputElement>;
  @ViewChild('selectedCurrencyDropdown') selectedCurrencyDropdown!: ElementRef<HTMLSelectElement>;

  @ViewChild(MediaSelectorComponent) displayPictureSelector!: MediaSelectorComponent;
  @ViewChild(MediaViewerComponent) displayPictureViewer!: MediaViewerComponent;


  constructor(private miningService: MiningService, private tradeService: TradeService, private weatherService: WeatherService, private userService: UserService, private coinService: CoinValueService) {
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
    this.isNicehashApiKeysToggled = this.showOnlyNicehashApiKeys ?? false;
    this.isKrakenApiKeysToggled = this.showOnlyKrakenApiKeys ?? false;

    const user = this.inputtedParentRef?.user ?? this.parentRef?.user;
    if (user?.id) {
      this.userService.getUserSettings(user.id).then(res => {
        if (res) {
          this.isDisplayingNSFW = res.nsfwEnabled ?? false; 
        }
      });
    }
    this.getUniqueCurrencyNames();

    if (this.showOnlyWeatherLocation) {
      this.isWeatherLocationToggled = true;
      this.getWeatherLocation();
    }
  }
  async getNicehashApiKeys() {
    const user = this.parentRef?.user;
    if (this.isNicehashApiKeysToggled && user?.id) {
      this.nhApiKeys = await this.miningService.getNicehashApiInfo(user.id);
    }
  }
  async getKrakenApiKeys() {
    if (this.isKrakenApiKeysToggled && this.parentRef?.user?.id && this.parentRef.user.id != 0) {
      this.hasKrakenKeys = await this.tradeService.hasApiKey(this.parentRef.user.id);
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
    if (this.isKrakenApiKeysToggled && user) {
      const krakenPrivateKey = this.krakenPrivateKey.nativeElement.value;
      const krakenApiKey = this.krakenApiKey.nativeElement.value; 
      try {
        parent?.getSessionToken().then(sessionToken => {
          this.tradeService.updateApiKey(user.id ?? 0, krakenApiKey, krakenPrivateKey, sessionToken).then(res => {
            if (res) {
              this.parentRef?.showNotification(res);
            }
          });
        });
      } catch (error) {
        console.log(error);
      }
    }
  }
  async updateNHAPIKeys() {
    const user = this.parentRef?.user;
    if (this.isNicehashApiKeysToggled && user?.id) {
      let keys = new NicehashApiKeys();
      keys.orgId = this.orgId.nativeElement.value;
      keys.apiKey = this.apiKey.nativeElement.value;
      keys.apiSecret = this.apiSecret.nativeElement.value;
      keys.ownership = this.parentRef?.user!.id;

      try {
        await this.miningService.updateNicehashApiInfo(user.id, keys);
        this.parentRef?.showNotification("Nicehash API Keys updated successfully");
      } catch {
        this.parentRef?.showNotification("Error while updating Nicehash API Keys!");
      }
      this.ngOnInit();
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
    const cookie = parent.getCookie("user");
    const sessionToken = await parent.getSessionToken();
    if (cookie) {
      if (confirm("Are you sure you wish to delete your account? This will also delete all your saved data, chats, etc.")) {
        const tmpUser = JSON.parse(cookie) as User;
        try {
          const res = await this.userService.deleteUser(tmpUser.id ?? 0, sessionToken);
          parent.showNotification(res["message"]);
          parent.deleteCookie("user");
          window.location.reload(); 
        } catch (error) {
          parent.showNotification(`Error deleting user ${tmpUser.username}`);
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

  formatDate(date?: Date): string {
    if (!date || !(date instanceof Date)) return ''; // Handle null or undefined cases
    const isoDate = date.toISOString(); // Convert date to ISO string
    return isoDate.substring(0, 10); // Extract YYYY-MM-DD part
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
  closeThisComponent() {
    if (this.previousComponent) {
      this.parentRef?.createComponent(this.previousComponent);
    }
    else  if (!this.showOnlySelectableMenuItems) {
      this.parentRef?.createComponent('User');
    } else {
      this.remove_me('UpdateUserProfile');
    }
  }
}
