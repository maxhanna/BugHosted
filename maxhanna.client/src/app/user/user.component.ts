import { Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { User } from '../../services/datacontracts/user';
import { UserService } from '../../services/user.service';
import { MiningService } from '../../services/mining.service';
import { NicehashApiKeys } from '../../services/datacontracts/nicehash-api-keys';
import { WeatherLocation } from '../../services/datacontracts/weather-location';
import { WeatherService } from '../../services/weather.service';
import { MenuItem } from '../../services/datacontracts/menu-item';
import { Story } from '../../services/datacontracts/story';
import { SocialService } from '../../services/social.service';
import { FriendService } from '../../services/friend.service';
import { FriendRequest } from '../../services/datacontracts/friendship-request';
import { ContactService } from '../../services/contact.service';
import { WordlerScore } from '../../services/datacontracts/wordler-score';
import { WordlerService } from '../../services/wordler.service';


@Component({
  selector: 'app-user',
  templateUrl: './user.component.html',
  styleUrl: './user.component.css'
})
export class UserComponent extends ChildComponent implements OnInit {
  @Input() user?: User | undefined;

  @ViewChild('loginUsername') loginUsername!: ElementRef<HTMLInputElement>;
  @ViewChild('loginPassword') loginPassword!: ElementRef<HTMLInputElement>;
  @ViewChild('updatedUsername') updatedUsername!: ElementRef<HTMLInputElement>;
  @ViewChild('updatedPassword') updatedPassword!: ElementRef<HTMLInputElement>;
  @ViewChild('orgId') orgId!: ElementRef<HTMLInputElement>;
  @ViewChild('apiKey') apiKey!: ElementRef<HTMLInputElement>;
  @ViewChild('apiSecret') apiSecret!: ElementRef<HTMLInputElement>;
  @ViewChild('weatherLocationInput') weatherLocationInput!: ElementRef<HTMLInputElement>;
  updateUserDivVisible = true;
  notifications: Array<string> = [];
  usersCount: string | null = null;
  isGeneralToggled = false;
  isNicehashApiKeysToggled = false;
  isWeatherLocationToggled = false;
  isMenuIconsToggled = true;
  nhApiKeys?: NicehashApiKeys;
  selectableIcons: MenuItem[] = [];
  stories: Story[] = [];
  friends: User[] = [];
  friendRequests: FriendRequest[] = [];
  wordlerScores: WordlerScore[] = [];

  constructor(private userService: UserService,
    private contactService: ContactService,
    private miningService: MiningService,
    private weatherService: WeatherService,
    private friendService: FriendService,
    private wordlerService: WordlerService) { super(); }

  async ngOnInit() {
    this.startLoading();
    this.getLoggedInUser();
    this.usersCount = await this.userService.getUserCount();
    this.selectableIcons = this.parentRef!.navigationItems.filter(x => x.title !== 'Close Menu' && x.title !== 'User');
    await this.loadFriendData();
    await this.loadWordlerData(); 
    this.stopLoading();
  }

  async loadWordlerData() {
    try {
      const res = await this.wordlerService.getAllScores(this.user ?? this.parentRef?.user);
      console.log(res);
      if (res) {
        this.wordlerScores = res;
      }
    } catch (e) { } 
  }

  async loadFriendData() {
    this.friends = await this.friendService.getFriends(this.user ?? this.parentRef?.user!);
    console.log("maybe loading friend data");

    if ((!this.user && this.parentRef && this.parentRef.user)
      || (this.user && this.parentRef && this.parentRef.user)) {
      const res = await this.friendService.getFriendRequests(this.user ?? this.parentRef.user);
      console.log("loading friend data");
      this.friendRequests = res;
    }
  }

  async addContact(user: User) {
    const res = await this.contactService.addUserContact(this.parentRef!.user!, user);
    this.notifications.push(res!);
  }

  canAddFriend(user: User) {
    let found = false;
    this.friends.forEach(x => {
      if (x.username == this.parentRef?.user?.username) {
        found = true;
      }
    });
    this.friendRequests.forEach(x => {
      if (x.sender.username == this.parentRef?.user?.username) {
        found = true;
      }
    });
    return !found;
  }

  friendsIncludeMe() {
    let found = false;
    this.friends.forEach(x => {
      if (x.username == this.parentRef?.user?.username) {
        found = true;
      }
    });
    return found;
  }

  clearForm() {
    if (this.updatedUsername) {
      this.updatedUsername.nativeElement.value = '';
      this.updatedPassword.nativeElement.value = '';
    }
    this.isNicehashApiKeysToggled = false;
    this.isGeneralToggled = false;
    this.updateUserDivVisible = false;
    this.isWeatherLocationToggled = false;
    this.isMenuIconsToggled = true;
    this.nhApiKeys = undefined;

    this.stories = [];
    this.friends = [];
    this.friendRequests = [];
  }

  logout() {
    this.parentRef!.deleteCookie("user");
    this.parentRef!.clearAllNotifications();
    this.parentRef!.removeAllComponents();
    this.clearForm();
    this.notifications.push("Logged out successfully");
    this.wordlerScores = [];
    this.friendRequests = [];
    this.friends = [];
    this.parentRef!.user = undefined;
  }

  menuIconsIncludes(title: string) {
    return this.parentRef!.userSelectedNavigationItems.filter(x => x.title == title).length > 0;
  }

  async acceptFriendshipRequest(request: FriendRequest) {
    const res = await this.friendService.acceptFriendRequest(request)
    this.notifications.push(res);
    await this.loadFriendData();
  }
  async denyFriendshipRequest(request: FriendRequest) {
    const res = await this.friendService.rejectFriendRequest(request)
    this.notifications.push(res);
    await this.loadFriendData();
  }

  async addFriend(user: User) {
    if (this.parentRef && this.parentRef.user) {
      const res = await this.friendService.sendFriendRequest(this.parentRef.user, user);
      this.notifications.push(res);
      await this.loadFriendData();
    } else {
      this.notifications.push("You must be logged in to send a friendship request");
    }
  }
  async removeFriend(user: User) {
    if (this.parentRef && this.parentRef.user) {
      const res = await this.friendService.removeFriend(this.parentRef.user, user);
      this.notifications.push(res);
      await this.loadFriendData();
    } else {
      this.notifications.push("You must be logged in to remove a friend");
    }
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

  async createUser() {
    const tmpUserName = this.loginUsername.nativeElement.value;
    const tmpPassword = this.loginPassword.nativeElement.value;
    if (!confirm(`Create user ${tmpUserName}?`)) { return; }
    if (tmpUserName) {
      const tmpUser = new User(undefined, tmpUserName, tmpPassword);
      try {
        const resCreateUser = await this.userService.createUser(tmpUser);
        if (resCreateUser && !resCreateUser.includes("Error")) {
          tmpUser.id = parseInt(resCreateUser!);
          this.notifications.push("Successfully added user");

          const ip = await this.userService.getUserIp();
          const resUpdateWeather = await this.weatherService.updateWeatherLocation(tmpUser, ip["ip_address"]);
          this.notifications.push(resUpdateWeather!);

          const resAddMenuItemSocial = await this.userService.addMenuItem(tmpUser, "Social");
          this.notifications.push(resAddMenuItemSocial + '');

          const resAddMenuItemMeme = await this.userService.addMenuItem(tmpUser, "Meme");
          this.notifications.push(resAddMenuItemMeme!);

          const resAddMenuItemChat = await this.userService.addMenuItem(tmpUser, "Chat");
          this.notifications.push(resAddMenuItemChat!);

          const resAddMenuItemWordler = await this.userService.addMenuItem(tmpUser, "Wordler");
          this.notifications.push(resAddMenuItemWordler!);
        } else {
          this.notifications.push(`${JSON.parse(resCreateUser!)["message"]}`);
        }
      } catch (error: any) {
        const message = error["message"];
        if (message.includes("409")) {
          this.notifications.push(`User already exists`);
        } else {
          this.notifications.push(`Error: ${message}`);
        }
      }
    }
  }

  async getLoggedInUser() {
    if (this.parentRef!.getCookie("user")) {
      this.parentRef!.user = JSON.parse(this.parentRef!.getCookie("user"));
    }
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
          this.logout();
        } catch (error) {
          this.notifications.push(`Error deleting user ${this.parentRef!.user?.username}`);
        }
      }
    } else { return alert("You must be logged in first!"); }
  }


  async login() {
    this.parentRef!.user = undefined;
    this.parentRef!.deleteCookie("user");
    const tmpLoginUser = new User(undefined, this.loginUsername.nativeElement.value, this.loginPassword.nativeElement.value);
    try {
      const tmpUser = await this.userService.getUser(tmpLoginUser);

      if (tmpUser && tmpUser.username) {
        this.parentRef!.setCookie("user", JSON.stringify(tmpUser), 10);
        this.parentRef!.user = tmpUser;
        this.notifications.push(`Access granted. Welcome back ${this.parentRef!.user?.username}`);
        const ip = await this.userService.getUserIp();
        const weatherLocation = await this.weatherService.getWeatherLocation(tmpUser) as WeatherLocation;
        if (weatherLocation && (this.isValidIpAddress(weatherLocation.location!) || weatherLocation.location!.trim() === '')) {
          await this.weatherService.updateWeatherLocation(tmpUser, ip["ip_address"]);
        }
        this.parentRef!.userSelectedNavigationItems = await this.userService.getUserMenu(tmpUser);

      } else {
        this.notifications.push("Access denied");
      }

    } catch (e) {
      this.notifications.push("Login error: " + e);
    } finally {
      this.ngOnInit();
    }
  }

  isValidIpAddress(value: string): boolean {
    const ipPattern = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipPattern.test(value);
  }
}
