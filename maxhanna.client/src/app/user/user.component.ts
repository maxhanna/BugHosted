import { Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component'; 
import { UserService } from '../../services/user.service'; 
import { WeatherService } from '../../services/weather.service';
import { FriendService } from '../../services/friend.service'; 
import { ContactService } from '../../services/contact.service'; 
import { WordlerService } from '../../services/wordler.service';
import { SocialComponent } from '../social/social.component';
import { Todo } from '../../services/datacontracts/todo';
import { TodoService } from '../../services/todo.service';
import { Contact } from '../../services/datacontracts/user/contact';
import { AppComponent } from '../app.component';
import { User } from '../../services/datacontracts/user/user';
import { FriendRequest } from '../../services/datacontracts/friends/friendship-request';
import { WordlerScore } from '../../services/datacontracts/wordler/wordler-score';
import { WeatherLocation } from '../../services/datacontracts/weather/weather-location';


@Component({
  selector: 'app-user',
  templateUrl: './user.component.html',
  styleUrl: './user.component.css'
})
export class UserComponent extends ChildComponent implements OnInit {
  @Input() user?: User | undefined;
  @Input() userId: string | null = null;
  @Input() loginOnly?: boolean | undefined;
  @Input() inputtedParentRef?: AppComponent | undefined;
  @Input() loginReasonMessage?: string | undefined;
  @Input() canClose = true;
  @Output() closeUserComponentEvent = new EventEmitter<User>();


  @ViewChild('loginUsername') loginUsername!: ElementRef<HTMLInputElement>;
  @ViewChild('loginPassword') loginPassword!: ElementRef<HTMLInputElement>;
  @ViewChild(SocialComponent) socialComponent!: SocialComponent;

  updateUserDivVisible = true;
  notifications: Array<string> = [];
  usersCount: string | null = null;
  isGeneralToggled = false;
  isNicehashApiKeysToggled = false;
  isWeatherLocationToggled = false;
  isMenuIconsToggled = true;
  isFriendsExpanded = false;
  isFriendRequestsExpanded = false;
  isAboutExpanded = true;
  isWordlerScoresExpanded = false;
  friends: User[] = [];
  friendRequests: FriendRequest[] = [];
  contacts: Contact[] = [];
  wordlerScores: WordlerScore[] = [];
  isMusicContainerExpanded = false;
  playListCount = 0;
  playListFirstFetch = true;
  songPlaylist: Todo[] = [];
  wordlerStreak: number = 0;

  constructor(private userService: UserService,
    private contactService: ContactService,
    private weatherService: WeatherService,
    private friendService: FriendService,
    private wordlerService: WordlerService,
    private todoService: TodoService,
  ) {
    super(); 
 }

  async ngOnInit() {
    if (this.inputtedParentRef) { 
      this.parentRef = this.inputtedParentRef;
    }
    this.startLoading();
    this.usersCount = await this.userService.getUserCount();
    try {
      if (this.userId) {
        const res = await this.userService.getUserById(parseInt(this.userId));
        if (res) {
          this.user = res as User;
          if (this.socialComponent) {
            this.socialComponent.user = this.user;
          }
        }
      } else {
        this.user = this.parentRef?.user;
      }

      await this.getLoggedInUser();
      await this.loadFriendData();
      await this.loadWordlerData();
      await this.loadSongData();
      await this.loadContactsData();
    }
    catch (error) { console.log((error as Error).message); }
    this.stopLoading();
  }

  override remove_me(title: string) {
    this.closeUserComponentEvent.emit();
    super.remove_me(title);
  }

  async gotPlaylistEvent(event: Array<Todo>) {
    this.playListCount = event.length;
  }
  async loadSongData() {
    try {
      const res = await this.todoService.getTodo(this.user ?? this.parentRef?.user!, "Music");

      if (res) {
        this.songPlaylist = res;
      }
    } catch (e) { }
  }
  async loadContactsData() {
    try {
      if (this.parentRef && this.parentRef.user) {
        const res = await this.contactService.getContacts(this.parentRef.user);

        if (res) {
          this.contacts = res;
        }
      } 
    } catch (e) { }
  }
  async loadWordlerData() {
    if (this.user || this.parentRef?.user) {
      try {
        const res = await this.wordlerService.getAllScores(this.user ?? this.parentRef?.user);
        if (res) {
          this.wordlerScores = res;
        }
        const wsRes = await this.wordlerService.getConsecutiveDayStreak((this.user ?? this.parentRef?.user)!);
        if (wsRes) {
          this.wordlerStreak = parseInt(wsRes);
        }
      } catch (e) { }
    }
  }

  async loadFriendData() {
    this.friends = await this.friendService.getFriends(this.user ?? this.parentRef?.user!);

    if ((!this.user && this.parentRef && this.parentRef.user)
      || (this.user && this.parentRef && this.parentRef.user)) {
      const res = await this.friendService.getFriendRequests(this.user ?? this.parentRef.user);
      this.friendRequests = res;
    }
  }

  expandDiv(event: string) {
    (document.getElementById(event) as HTMLDivElement).classList.toggle('expanded');
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

  contactsContains(user: User) {
    if (this.contacts.some(x => x.user!.id == user.id)) {
      return true;
    }
    return false;
  }

  clearForm() {

    this.isNicehashApiKeysToggled = false;
    this.isGeneralToggled = false;
    this.updateUserDivVisible = false;
    this.isWeatherLocationToggled = false;
    this.isMenuIconsToggled = true;

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
  async removeFriend(user?: User) {
    if (!user) return;
    if (this.parentRef && this.parentRef.user) {
      const res = await this.friendService.removeFriend(this.parentRef.user, user);
      this.notifications.push(res);
      await this.loadFriendData();
    } else {
      this.notifications.push("You must be logged in to remove a friend");
    }
  }


  async createUser(guest?: boolean) {
    let tmpUserName = this.loginUsername.nativeElement.value;
    const tmpPassword = this.loginPassword.nativeElement.value;
    if (guest && tmpUserName.trim() == "") {
      tmpUserName = "Guest" + Math.random().toString().slice(2, 5); 
    }
    if (tmpUserName.trim() == "") { return alert("Username cannot be empty!"); }
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

          const resAddMenuItemFiles = await this.userService.addMenuItem(tmpUser, "Files");
          this.notifications.push(resAddMenuItemFiles!);

          const resAddMenuItemEmulation = await this.userService.addMenuItem(tmpUser, "Emulation");
          this.notifications.push(resAddMenuItemEmulation!);

          const resAddMenuItemArray = await this.userService.addMenuItem(tmpUser, "Array");
          this.notifications.push(resAddMenuItemArray!);

          await this.login(guest ? tmpUserName : undefined);
          if (!this.loginOnly) { 
            this.parentRef?.createComponent('UpdateUserSettings');
          }
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

  async login(guest?: string) {
    console.log("logging in " + (guest ? " as " + guest : ""));
    if (this.parentRef?.user) { 
      this.parentRef.user = undefined;
    }
    if (this.parentRef) { 
      this.parentRef.deleteCookie("user");
    }
    let tmpUserName = this.loginUsername.nativeElement.value;
    if (guest) {
      tmpUserName = guest;
    }
    const tmpLoginUser = new User(undefined, tmpUserName, this.loginPassword.nativeElement.value);
    try {
      const tmpUser = await this.userService.getUser(tmpLoginUser);

      if (tmpUser && tmpUser.username) {
        this.parentRef!.setCookie("user", JSON.stringify(tmpUser), 10);
        this.parentRef!.user = tmpUser;
        this.notifications.push(`Access granted. Welcome back ${this.parentRef!.user?.username}`);
        const ip = await this.userService.getUserIp();
        const weatherLocation = await this.weatherService.getWeatherLocation(tmpUser) as WeatherLocation;
        if (weatherLocation && (this.userService.isValidIpAddress(weatherLocation.location!) || weatherLocation.location!.trim() === '')) {
          await this.weatherService.updateWeatherLocation(tmpUser, ip["ip_address"], ip["city"]);
        }
        this.parentRef!.userSelectedNavigationItems = await this.userService.getUserMenu(tmpUser);
        if (this.loginOnly) {
          console.log("closing emit");
          this.closeUserComponentEvent.emit(tmpUser);
        }
      } else {
        this.notifications.push("Access denied");
      }

    } catch (e) {
      this.notifications.push("Login error: " + e);
    } finally {
      this.ngOnInit();
    }
  }
  getNewFriendRequestCount() {
    const count = this.friendRequests.filter(x => x.status == '3').length;
    return count > 0 ? `(${count})` : '';
  }
  copyLink() {
    const userId = this.user?.id ?? this.userId ?? this.parentRef?.user?.id;
    const link = `https://bughosted.com/${userId ? `User/${userId}` : ''}`;
    navigator.clipboard.writeText(link).then(() => {
      this.notifications.push('Link copied to clipboard!');
    }).catch(err => {
      this.notifications.push('Failed to copy link!');
    });
  }
  getFilteredFriendRequests() {
    return this.friendRequests.filter(x => parseInt(x.status) == 0);
  }

  areWeFriends(other?: User) {
    if (!other || !Array.isArray(this.friends) || this.friends.length === 0) {
      return false;
    }
    return this.friends.some(x => x.id === other.id);
  }
}
