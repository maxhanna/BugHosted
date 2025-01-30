import { Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
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
export class UserComponent extends ChildComponent implements OnInit, OnDestroy {
  @Input() user?: User | undefined;
  @Input() userId: number | null = null;
  @Input() loginOnly?: boolean | undefined;
  @Input() inputtedParentRef?: AppComponent | undefined;
  @Input() loginReasonMessage?: string | undefined;
  @Input() canClose = true;
  @Output() closeUserComponentEvent = new EventEmitter<User>();


  @ViewChild('loginUsername') loginUsername!: ElementRef<HTMLInputElement>;
  @ViewChild('loginPassword') loginPassword!: ElementRef<HTMLInputElement>;
  @ViewChild('profileControls') profileControls!: ElementRef<HTMLSelectElement>;
  @ViewChild(SocialComponent) socialComponent!: SocialComponent;

  updateUserDivVisible = true;
  notifications: Array<string> = [];
  usersCount: string | null = null;
  isGeneralToggled = false;
  isNicehashApiKeysToggled = false;
  isWeatherLocationToggled = false;
  isMenuIconsToggled = true;
  isFriendRequestsExpanded = false;
  isAboutExpanded = true;
  isAboutOpen = false; 
  isFriendsPanelOpen = false;
  isAboutPanelOpen = false;  
  isMoreInfoOpen = false; 
  isEditingFriends = false;
  hasFriendRequests = false;
  friends: User[] = [];
  friendRequests: FriendRequest[] = [];
  friendRequestsSent: FriendRequest[] = [];
  friendRequestsReceived: FriendRequest[] = [];
  contacts: Contact[] = [];
  isMusicContainerExpanded = false;
  playListCount = 0;
  playListFirstFetch = true;
  justLoggedIn = false;
  songPlaylist: Todo[] = [];
  wordlerStreak: number = 0;
  weatherLocation = "";

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
        const res = await this.userService.getUserById(this.userId);
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
      if (this.user) {
        await this.loadFriendData();
        await this.loadWordlerData();
        await this.loadSongData();
        await this.loadContactsData();
        this.weatherService.getWeatherLocation(this.user).then(res => {
          if (res.city) {
            this.weatherLocation = res.city;
          }
        });
      }
    }
    catch (error) { console.log((error as Error).message); }
    this.stopLoading();
  }

  ngOnDestroy() {
    if (this.justLoggedIn) {
      const parent = this.parentRef ?? this.inputtedParentRef;
      if (parent && parent.navigationComponent) {
        parent.navigationComponent.getNotifications();
      }
    }
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
        const wsRes = await this.wordlerService.getConsecutiveDayStreak((this.user ?? this.parentRef?.user)!);
        if (wsRes) {
          this.wordlerStreak = parseInt(wsRes);
        }
      } catch (e) { }
    }
  }

  async loadFriendData() {
    this.hasFriendRequests = false;
    const user = this.user ?? this.parentRef?.user ?? this.inputtedParentRef?.user;

    if (user) {
      this.friends = await this.friendService.getFriends(user);
      const res = await this.friendService.getFriendRequests(user);
      this.friendRequests = res;
      this.friendRequests = this.friendRequests.filter(x => x.status != 1);
      this.friendRequestsSent = this.friendRequests.filter(x => (x.status == 0 || x.status == 3) && x.sender.id == user.id);
      this.friendRequestsReceived = this.friendRequests.filter(x => (x.status == 0 || x.status == 3) && x.sender.id != user.id);

      if (this.friendRequests.length > 0) {
        this.hasFriendRequests = true;
      }
    }

  }

  expandDiv(event: string) {
    console.log(event);
    const isOpen = event === "aboutContainer" ? this.isAboutExpanded : this.isMusicContainerExpanded;
    console.log(isOpen);

    this.isAboutExpanded = false;  
    this.isMusicContainerExpanded = false; 

    if (event === "aboutContainer") { 
      this.isAboutExpanded = !!!isOpen;
    } else if (event === "musicProfileContainer") {
      this.isMusicContainerExpanded = !!!isOpen;
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

  async logout() {
    if (this.parentRef) {
      this.parentRef.navigationItems = this.parentRef.navigationItems.filter(x => {
        const title = x.title.toLowerCase();
        title == "chat" || title == "meme" || title == "emulation" || title == "social" || title == "bug-wars" || title == "user" || title == "close menu"
      });
      this.parentRef.userSelectedNavigationItems = this.parentRef.userSelectedNavigationItems.filter(x => {
        const title = x.title.toLowerCase();
        title == "chat" || title == "meme" || title == "emulation" || title == "social" || title == "bug-wars" || title == "user" || title == "close menu"
      });
      this.parentRef.deleteCookie("user");
      this.parentRef.clearAllNotifications();
      this.parentRef.user = undefined;
    }
    this.clearForm();
    this.friendRequests = [];
    this.friends = [];
    this.user = undefined;
    this.notifications.push("Logged out successfully, refresh in 100 milliseconds.");
    setTimeout(() => {
      window.location = window.location;
    }, 100);
  }


  async acceptFriendshipRequest(request: FriendRequest) {
    const res = await this.friendService.acceptFriendRequest(request)
    this.notifications.push(res);
    await this.ngOnInit();
  }
  async denyFriendshipRequest(request: FriendRequest) {
    const res = await this.friendService.rejectFriendRequest(request)
    this.notifications.push(res);
    await this.ngOnInit();
  } 
  async deleteFriendshipRequest(request: FriendRequest) {
    const res = await this.friendService.deleteFriendRequest(request);
    this.notifications.push(res);
    await this.ngOnInit();
  }
 
  onProfileControlsChange() {
    const command = this.profileControls.nativeElement.value;

    switch (command) {
      case 'shareProfile':
        this.copyLink();
        break;
      case 'addFriend':
        if (this.user) {
          this.addFriend(this.user);
        }
        break;
      case 'removeFriend':
        this.removeFriend(this.user);
        break;
      case 'addContact':
        if (this.user) {
          this.addContact(this.user);
        }
        break;
      case 'chat':
        this.openChat();
        break;
      case 'userInfo':
        this.openAboutPanel();
        break;
      case 'showFriends':
        this.openFriendsPanel();
        break; 
      case 'settings':
        this.parentRef?.createComponent('UpdateUserSettings', { showOnlySelectableMenuItems: false, areSelectableMenuItemsExplained: false, inputtedParentRef: this.parentRef })
        break;
      case 'logout':
        this.logout()
        break;
      default:
        break;
    }

    // Reset the select dropdown to the default "Options" placeholder
    this.profileControls.nativeElement.selectedIndex = 0;
  }


  async addFriend(user: User) {
    if (this.parentRef && this.parentRef.user) {
      const res = await this.friendService.sendFriendRequest(this.parentRef.user, user);
      this.notifications.push(res);
      await this.ngOnInit();
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
        if (resCreateUser && !resCreateUser.toLowerCase().includes("error")) {
          tmpUser.id = parseInt(resCreateUser!);
          this.notifications.push("Successfully added user");
          try {
            this.updateWeatherInBackground(tmpUser);
          } catch {
            this.notifications.push("No weather data can be fetched");
          }

          const resAddMenuItemSocial = await this.userService.addMenuItem(tmpUser, ["Social", "Meme", "Wordler", "Files", "Emulation", "Bug-Wars", "Notifications"]);
          if (resAddMenuItemSocial) {
            this.notifications.push(resAddMenuItemSocial + '');
          }

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
        tmpUser.password = undefined;
        this.parentRef!.setCookie("user", JSON.stringify(tmpUser), 10);
        this.parentRef!.user = tmpUser;
        this.notifications.push(`Access granted. Welcome back ${this.parentRef!.user?.username}`);
        this.updateWeatherInBackground(tmpUser);

        this.parentRef!.userSelectedNavigationItems = await this.userService.getUserMenu(tmpUser);

        if (this.loginOnly) {
          this.closeUserComponentEvent.emit(tmpUser);
        }
      } else {
        this.notifications.push("Access denied");
      }

    } catch (e) {
      this.notifications.push("Login error: " + e);
    } finally {
      this.justLoggedIn = true;
      this.ngOnInit();
    }
  }
  getNewFriendRequestCount() {
    const count = this.friendRequests.filter(x => x.status == 3).length;
    return count > 0 ? `(${count})` : '';
  }
  daysSince(date?: Date) {
    if (!date) return;
    const today = new Date();
    const givenDate = new Date(date);
    const diffInMs = today.getTime() - givenDate.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    return diffInDays;
  }
  copyLink() {
    const userId = this.user?.id ?? this.userId ?? this.parentRef?.user?.id;
    const link = `https://bughosted.com/${userId ? `User/${userId}` : ''}`;
    try {
      navigator.clipboard.writeText(link).then(() => {
        this.notifications.push('Link copied to clipboard!');
      }).catch(err => {
        this.notifications.push('Failed to copy link!');
      });
    }
    catch {
      this.notifications.push('Failed to copy link!');
    }
  }
  getFilteredFriendRequests() {
    return this.friendRequests.filter(x => x.status == 0);
  }

  areWeFriends(other?: User) {
    if (!other || !Array.isArray(this.friends) || this.friends.length === 0) {
      return false;
    }
    return this.friends.some(x => x.id === other.id);
  }
  openChat() {
    this.parentRef?.createComponent("Chat", { selectedUser: this.user });
  }
  async updateWeatherInBackground(tmpUser: User, withCity?: boolean) {
    const ip = await this.userService.getUserIp();
    const res = await this.weatherService.updateWeatherLocation(tmpUser, ip?.ip, ip?.city, ip?.country);
  }
  openFriendsPanel() {
    this.isFriendsPanelOpen = true;
    const parent = this.parentRef ?? this.inputtedParentRef;
    if (parent) {
      parent.showOverlay = true;
    }
  }
  closeFriendsPanel() {
    this.isFriendsPanelOpen = false;
    const parent = this.parentRef ?? this.inputtedParentRef;
    if (parent) {
      parent.closeOverlay();
    } 
  }
  openAboutPanel() {
    this.isAboutPanelOpen = true;
    const parent = this.parentRef ?? this.inputtedParentRef;
    if (parent) {
      parent.showOverlay = true;
    }
  }
  closeAboutPanel() {
    this.isAboutPanelOpen = false;
    const parent = this.parentRef ?? this.inputtedParentRef;
    if (parent) {
      parent.closeOverlay();
    } 
  }
}
