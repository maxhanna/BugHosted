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
import { ExchangeRate } from '../../services/datacontracts/crypto/exchange-rate';

@Component({
  selector: 'app-update-user-settings',
  templateUrl: './update-user-settings.component.html',
  styleUrl: './update-user-settings.component.css'
})
export class UpdateUserSettingsComponent extends ChildComponent implements OnInit {
  updateUserDivVisible = false;
  isGeneralToggled = false;
  isMenuIconsToggled = false;
  isWeatherLocationToggled = false;
  isDisplayPictureToggled = false;
  isDeleteAccountToggled = false;
  isBTCWalletAddressesToggled = false;
  isAboutToggled = false;
  showAddBTCWalletAddressInput = false;
  selectableIcons: MenuItem[] = [];
  btcWalletAddresses?: string[];
  notifications: string[] = [];
  isNicehashApiKeysToggled: any;
  selectedCurrency = '';
  uniqueCurrencyNames: string[] = [];
  nhApiKeys?: NicehashApiKeys;
  displayPictureFile?: FileEntry = this.parentRef?.user?.displayPictureFile;

  @Input() inputtedParentRef?: AppComponent;
  @Input() showOnlySelectableMenuItems? = true;
  @Input() areSelectableMenuItemsExplained? = true;

  @ViewChild('updatedUsername') updatedUsername!: ElementRef<HTMLInputElement>;
  @ViewChild('updatedPassword') updatedPassword!: ElementRef<HTMLInputElement>;
  @ViewChild('orgId') orgId!: ElementRef<HTMLInputElement>;
  @ViewChild('apiKey') apiKey!: ElementRef<HTMLInputElement>;
  @ViewChild('apiSecret') apiSecret!: ElementRef<HTMLInputElement>;
  @ViewChild('weatherLocationInput') weatherLocationInput!: ElementRef<HTMLInputElement>;

  @ViewChild('updatedEmail') updatedEmail!: ElementRef<HTMLInputElement>;
  @ViewChild('isEmailPublicYes') isEmailPublicYes!: ElementRef<HTMLInputElement>;
  @ViewChild('isEmailPublicNo') isEmailPublicNo!: ElementRef<HTMLInputElement>;
  @ViewChild('updatedPhone') updatedPhone!: ElementRef<HTMLInputElement>;
  @ViewChild('updatedBirthday') updatedBirthday!: ElementRef<HTMLInputElement>;
  @ViewChild('updatedDescription') updatedDescription!: ElementRef<HTMLInputElement>;
  @ViewChild('selectedCurrencyDropdown') selectedCurrencyDropdown!: ElementRef<HTMLSelectElement>;

  @ViewChild(MediaSelectorComponent) displayPictureSelector!: MediaSelectorComponent;
  @ViewChild(MediaViewerComponent) displayPictureViewer!: MediaViewerComponent;


  constructor(private miningService: MiningService, private weatherService: WeatherService, private userService: UserService, private coinService: CoinValueService) {
    super();
  }
  async ngOnInit() {
    this.selectableIcons = this.parentRef!.navigationItems.filter(x => x.title !== 'Close Menu' && x.title !== 'User' && x.title !== 'UpdateUserSettings');

    this.updateUserDivVisible = false;
    this.isGeneralToggled = false;
    this.isMenuIconsToggled = false;
    this.isWeatherLocationToggled = false;
    this.isDisplayPictureToggled = false;
    this.isDeleteAccountToggled = false;
    this.isAboutToggled = false;

    this.getUniqueCurrencyNames();
  }
  async getNicehashApiKeys() {
    if (this.isNicehashApiKeysToggled) {
      this.nhApiKeys = await this.miningService.getNicehashApiInfo((this.parentRef?.user)!);
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
    let about = new UserAbout();
    console.log(this.selectedCurrency);
    about.userId = this.parentRef!.user!.id!;
    about.description = this.updatedDescription.nativeElement.value != '' ? this.updatedDescription.nativeElement.value : undefined;
    about.phone = this.updatedPhone.nativeElement.value != '' ? this.updatedPhone.nativeElement.value : undefined;
    about.email = this.updatedEmail.nativeElement.value != '' ? this.updatedEmail.nativeElement.value : undefined;
    about.isEmailPublic = this.isEmailPublicYes.nativeElement.checked ? true : false;
    about.birthday = this.updatedBirthday.nativeElement.value != '' ? new Date(this.updatedBirthday.nativeElement.value) : undefined;
    about.currency = this.selectedCurrencyDropdown.nativeElement.value != '' ? this.selectedCurrencyDropdown.nativeElement.value : undefined;
    await this.userService.updateUserAbout(this.parentRef!.user!, about).then(async res => {
      if (res) {
        const parent = this.inputtedParentRef ? this.inputtedParentRef : this.parentRef;
        const user = parent?.user;
        if (user && parent) {
          user.about = about;
          parent.resetUserCookie();
          this.ngOnInit();
          this.parentRef?.showNotification(res);
        }
      }
    });
  }
  async updateNHAPIKeys() {
    if (this.isNicehashApiKeysToggled) {
      let keys = new NicehashApiKeys();
      keys.orgId = this.orgId.nativeElement.value;
      keys.apiKey = this.apiKey.nativeElement.value;
      keys.apiSecret = this.apiSecret.nativeElement.value;
      keys.ownership = this.parentRef?.user!.id;

      try {
        await this.miningService.updateNicehashApiInfo((this.parentRef?.user)!, keys);
        this.parentRef?.showNotification("Nicehash API Keys updated successfully");
      } catch {
        this.parentRef?.showNotification("Error while updating Nicehash API Keys!");
      }
      this.ngOnInit();
    }
  }

  async getWeatherLocation() {
    if (this.isWeatherLocationToggled) {
      const res = await this.weatherService.getWeatherLocation(this.parentRef?.user!);
      this.weatherLocationInput.nativeElement.value = res.location;
    }
  }

  async updateWeatherLocation() {
    if (this.isWeatherLocationToggled) {
      try {
        const inputLoc = this.weatherLocationInput.nativeElement.value;
        if (inputLoc && inputLoc.trim() != '') {
          await this.weatherService.updateWeatherLocation(this.parentRef!.user!, this.weatherLocationInput.nativeElement.value);
        }
        else {
          if (this.parentRef?.user) {
            const ip = await this.userService.getUserIp();
            const weatherLocation = await this.weatherService.getWeatherLocation(this.parentRef.user) as WeatherLocation;
            if (weatherLocation && (this.userService.isValidIpAddress(weatherLocation.location) || weatherLocation.location?.trim() === '')) {
              await this.weatherService.updateWeatherLocation(this.parentRef.user, ip?.ip, ip?.city, ip?.country);
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
    if (files && files.length > 0) {
      const res = await this.userService.updateDisplayPicture(this.parentRef?.user!, files[0].id);
      const targetParent = this.inputtedParentRef ?? this.parentRef;
      if (targetParent && targetParent.user) {
        targetParent.user.displayPictureFile = files[0];
        targetParent.deleteCookie("user");
        targetParent.setCookie("user", JSON.stringify(targetParent.user), 10);
        this.ngOnInit();
      }
    }
  }

  async updateUser() {
    const currUser = JSON.parse(this.parentRef!.getCookie("user")) as User;
    const tmpUser = new User(currUser.id, this.updatedUsername.nativeElement.value, this.updatedPassword.nativeElement.value);
    this.startLoading();
    try {
      const res = await this.userService.updateUser(tmpUser);
      const message = res["message"];
      this.parentRef!.setCookie("user", JSON.stringify(tmpUser), 10);
      this.parentRef?.showNotification(message);
    } catch (error) {
      this.parentRef?.showNotification(`Error updating user ${this.parentRef!.user?.username}. Error: ${JSON.stringify(error)}`);
    }
    this.parentRef!.user = await this.userService.getUser(tmpUser);
    this.stopLoading();
  }

  async deleteUser() {
    if (this.parentRef!.getCookie("user")) {
      if (confirm("Are you sure you wish to delete your account? This will also delete all your saved data, chats, etc.")) {
        const tmpUser = JSON.parse(this.parentRef!.getCookie("user")) as User;
        try {
          const res = await this.userService.deleteUser(tmpUser);
          this.parentRef?.showNotification(res["message"]);
          this.parentRef?.deleteCookie("user");
          window.location = window.location;
        } catch (error) {
          this.parentRef?.showNotification(`Error deleting user ${this.parentRef!.user?.username}`);
        }
      }
    } else { return alert("You must be logged in first!"); }
  }
  async getMenuIcons() {
    this.isMenuIconsToggled = !this.isMenuIconsToggled;

    if (this.isMenuIconsToggled) {
      const response = await this.userService.getUserMenu(this.parentRef?.user!);
      this.parentRef!.userSelectedNavigationItems = response;
    }
  }

  async selectMenuIcon(title: string) {
    if (this.parentRef?.isModalOpen) {
      return event?.preventDefault();
    }
    if (this.parentRef && this.parentRef.userSelectedNavigationItems.some(x => x.title == title)) {
      this.parentRef!.userSelectedNavigationItems = this.parentRef!.userSelectedNavigationItems.filter(x => x.title != title);
      this.userService.deleteMenuItem(this.parentRef?.user!, title);
      this.parentRef?.showNotification(`Deleted menu item : ${title}`);
    } else {
      this.parentRef!.userSelectedNavigationItems!.push(new MenuItem(this.parentRef?.user?.id ?? 0, title));
      if (this.parentRef && this.parentRef.user) {
        this.userService.addMenuItem(this.parentRef.user, [title]);
      }
      this.parentRef?.showNotification(`Added menu item : ${title}`);
    }
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
    if (!this.parentRef || !this.parentRef.user) {
      return alert("You must be logged in!");
    }
    const inputs = Array.from(document.getElementsByClassName("btcWalletInput")) as HTMLInputElement[];
    let wallets: string[] = [];
    for (let input of inputs) {
      wallets.push(input.value);
    }
    await this.userService.updateBTCWalletAddresses(this.parentRef.user, wallets);
    alert("BTC Wallet Addresses Updated. Visit the Crypto-Hub App To Track.");
  }
  async getBTCWalletAddresses() {
    if (this.btcWalletAddresses) return;

    this.btcWalletAddresses = [];
    if (this.parentRef && this.parentRef.user) {
      this.userService.getBTCWallet(this.parentRef.user).then((res: MiningWalletResponse) => {
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
  async deleteBTCWalletAddress(address: string) {
    if (this.parentRef && this.parentRef.user) {
      if (!confirm(`Delete BTC Wallet Address : ${address}?`)) return;

      await this.userService.deleteBTCWalletAddress(this.parentRef.user, address);
      const inputs = Array.from(document.getElementsByClassName("btcWalletInput")) as HTMLInputElement[];
      for (let input of inputs) {
        if (input.value == address) {
          input.value = "";
        }
      }
    }
  }
}
