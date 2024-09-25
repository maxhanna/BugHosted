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
  isAboutToggled = false; 
  selectableIcons: MenuItem[] = [];
  notifications: string[] = [];
  isNicehashApiKeysToggled: any;
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
  @ViewChild('updatedPhone') updatedPhone!: ElementRef<HTMLInputElement>;
  @ViewChild('updatedBirthday') updatedBirthday!: ElementRef<HTMLInputElement>;
  @ViewChild('updatedDescription') updatedDescription!: ElementRef<HTMLInputElement>;
 
  @ViewChild(MediaSelectorComponent) displayPictureSelector!: MediaSelectorComponent;
  @ViewChild(MediaViewerComponent) displayPictureViewer!: MediaViewerComponent;


  constructor(private miningService: MiningService, private weatherService: WeatherService, private userService: UserService) {
    super();
  }
  async ngOnInit() {
    console.log(this.parentRef?.user?.username + " is username! ");

    this.selectableIcons = this.parentRef!.navigationItems.filter(x => x.title !== 'Close Menu' && x.title !== 'User' && x.title !== 'UpdateUserSettings');
    this.parentRef!.user = await this.userService.getUser(this.parentRef!.user!);
    console.log(this.parentRef?.user?.username + " is username! " + this.parentRef?.user?.displayPictureFile?.id + " is displayPictureId");
//    this.displayPictureViewer.file 
  }
  async getNicehashApiKeys() {
    if (this.isNicehashApiKeysToggled) {
      this.nhApiKeys = await this.miningService.getNicehashApiInfo((this.parentRef?.user)!);
    }
  }
  async updateUserAbout() {
    let about = new UserAbout();
    about.userId = this.parentRef!.user!.id!;
    about.description = this.updatedDescription.nativeElement.value != '' ? this.updatedDescription.nativeElement.value : undefined;
    about.phone = this.updatedPhone.nativeElement.value != '' ? this.updatedPhone.nativeElement.value : undefined;
    about.email = this.updatedEmail.nativeElement.value != '' ? this.updatedEmail.nativeElement.value : undefined;
    about.birthday = this.updatedBirthday.nativeElement.value != '' ? new Date(this.updatedBirthday.nativeElement.value) : undefined;
    const res = await this.userService.updateUserAbout(this.parentRef!.user!, about);
    if (res) {
      this.notifications.push(res); 
    }
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
        this.notifications.push("Nicehash API Keys updated successfully");
      } catch {
        this.notifications.push("Error while updating Nicehash API Keys!");
      }
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
        else
        {
          const ip = await this.userService.getUserIp();
          const weatherLocation = await this.weatherService.getWeatherLocation(this.parentRef!.user!) as WeatherLocation;
          if (weatherLocation && (this.userService.isValidIpAddress(weatherLocation.location) || weatherLocation.location?.trim() === '')) {
            await this.weatherService.updateWeatherLocation(this.parentRef!.user!, ip["ip_address"], ip["city"]);
          }
        }
       
        this.notifications.push("Weather location updated successfully");
      } catch {
        this.notifications.push("Error while updating weather location!");
      }
    }
  }

  async avatarSelected(files: FileEntry[]) {
    if (files && files.length > 0) {
      console.log("updating avatar for user : " + this.parentRef?.user?.username + " fileId: " + files[0].id);
      const res = await this.userService.updateDisplayPicture(this.parentRef?.user!, files[0].id);
      this.parentRef!.user = await this.userService.getUser(this.parentRef?.user!);
      this.displayPictureFile = this.parentRef?.user?.displayPictureFile;
      this.displayPictureSelector.selectedFiles = [];
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
      this.notifications.push(message);
    } catch (error) {
      this.notifications.push(`Error updating user ${this.parentRef!.user?.username}. Error: ${JSON.stringify(error)}`);
    }
    this.parentRef!.user = await this.userService.getUser(tmpUser);
    this.stopLoading();
  }

  async deleteUser() {
    if (this.parentRef!.getCookie("user")) {
      if (confirm("Are you sure you wish to delete your account?")) {
        const tmpUser = JSON.parse(this.parentRef!.getCookie("user")) as User;
        try {
          const res = await this.userService.deleteUser(tmpUser);
          this.notifications.push(res["message"]);
          this.parentRef?.deleteCookie("user");
          window.location = window.location;
        } catch (error) {
          this.notifications.push(`Error deleting user ${this.parentRef!.user?.username}`);
        }
      }
    } else { return alert("You must be logged in first!"); }
  }
  async getMenuIcons() {
    console.log("getmenuIcons yeee");
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
    if (this.parentRef!.userSelectedNavigationItems.some(x => x.title == title)) {
      this.parentRef!.userSelectedNavigationItems = this.parentRef!.userSelectedNavigationItems.filter(x => x.title != title);
      this.userService.deleteMenuItem(this.parentRef?.user!, title);
      this.notifications.push(`Deleted menu item : ${title}`);

    } else {
      this.parentRef!.userSelectedNavigationItems!.push(new MenuItem(this.parentRef?.user!.id!, title));
      if (this.parentRef && this.parentRef.user) {
        this.userService.addMenuItem(this.parentRef.user, title);
      }
      this.notifications.push(`Added menu item : ${title}`);
    }
  }


  menuIconsIncludes(title: string) {
    return this.parentRef!.userSelectedNavigationItems.some(x => x.title == title) || this.inputtedParentRef?.userSelectedNavigationItems.some(x => x.title == title);
  }

  formatDate(date: Date): string {
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
}
