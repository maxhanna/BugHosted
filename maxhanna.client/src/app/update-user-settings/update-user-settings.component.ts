import { Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
 import { MenuItem } from '../../services/datacontracts/menu-item';
import { MiningService } from '../../services/mining.service';
import { WeatherService } from '../../services/weather.service';
import { UserService } from '../../services/user.service';
import { ChildComponent } from '../child.component';
import { User } from '../../services/datacontracts/user';
import { NicehashApiKeys } from '../../services/datacontracts/nicehash-api-keys';

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
  selectableIcons: MenuItem[] = [];
  notifications: string[] = [];
  isNicehashApiKeysToggled: any;
  nhApiKeys?: NicehashApiKeys;
 

  @ViewChild('updatedUsername') updatedUsername!: ElementRef<HTMLInputElement>;
  @ViewChild('updatedPassword') updatedPassword!: ElementRef<HTMLInputElement>;
  @ViewChild('orgId') orgId!: ElementRef<HTMLInputElement>;
  @ViewChild('apiKey') apiKey!: ElementRef<HTMLInputElement>;
  @ViewChild('apiSecret') apiSecret!: ElementRef<HTMLInputElement>;
  @ViewChild('weatherLocationInput') weatherLocationInput!: ElementRef<HTMLInputElement>;

  constructor(private miningService: MiningService, private weatherService: WeatherService, private userService: UserService) {
    super();
  }
  ngOnInit() {
    this.selectableIcons = this.parentRef!.navigationItems.filter(x => x.title !== 'Close Menu' && x.title !== 'User');

  }
  async getNicehashApiKeys() {
    if (this.isNicehashApiKeysToggled) {
      this.nhApiKeys = await this.miningService.getNicehashApiInfo((this.parentRef?.user)!);
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
        await this.weatherService.updateWeatherLocation((this.parentRef?.user)!, this.weatherLocationInput.nativeElement.value);
        this.notifications.push("Weather location updated successfully");
      } catch {
        this.notifications.push("Error while updating weather location!");
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
         // this.logout();
        } catch (error) {
          this.notifications.push(`Error deleting user ${this.parentRef!.user?.username}`);
        }
      }
    } else { return alert("You must be logged in first!"); }
  }
  async getMenuIcons() {
    if (this.isMenuIconsToggled) {
      const response = await this.userService.getUserMenu(this.parentRef?.user!);
      this.parentRef!.userSelectedNavigationItems = response;
    }
  }

  async selectMenuIcon(title: string) {
    if (this.parentRef!.userSelectedNavigationItems.filter(x => x.title == title).length > 0) {
      this.parentRef!.userSelectedNavigationItems = this.parentRef!.userSelectedNavigationItems.filter(x => x.title != title);
      this.userService.deleteMenuItem(this.parentRef?.user!, title);
      this.notifications.push(`Deleted menu item : ${title}`);

    } else {
      this.parentRef!.userSelectedNavigationItems!.push(new MenuItem(this.parentRef?.user!.id!, title));
      this.userService.addMenuItem(this.parentRef?.user!, title);
      this.notifications.push(`Added menu item : ${title}`);
    }
  }

  menuIconsIncludes(title: string) {
    return this.parentRef!.userSelectedNavigationItems.filter(x => x.title == title).length > 0;
  }
}
