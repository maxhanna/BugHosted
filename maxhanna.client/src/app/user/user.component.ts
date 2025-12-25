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
import { Trophy } from '../../services/datacontracts/user/trophy';
import { NexusService } from '../../services/nexus.service';
import { MetaService } from '../../services/meta.service';
import { NotificationService } from '../../services/notification.service';
import { SocialService } from '../../services/social.service';
import { FileService } from '../../services/file.service';
import { EnderService } from '../../services/ender.service';
import { MastermindService } from '../../services/mastermind.service';
import { FavouriteService } from '../../services/favourite.service';
import { ReactionService } from '../../services/reaction.service';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { TopService } from '../../services/top.service';
import { MediaSelectorComponent } from '../media-selector/media-selector.component';
import { TradeService } from '../../services/trade.service';
import { RomService } from '../../services/rom.service';

@Component({
  selector: 'app-user',
  templateUrl: './user.component.html',
  styleUrl: './user.component.css',
  standalone: false
})
export class UserComponent extends ChildComponent implements OnInit, OnDestroy {
  @Input() user?: User | undefined;
  @Input() userId: number | null = null;
  @Input() storyId: number | undefined = undefined;
  @Input() commentId: number | undefined = undefined;
  @Input() loginOnly?: boolean | undefined;
  @Input() inputtedParentRef?: AppComponent | undefined;
  @Input() loginReasonMessage?: string | undefined;
  @Input() canClose = true;
  @Output() closeUserComponentEvent = new EventEmitter<User>();


  @ViewChild('loginUsername') loginUsername!: ElementRef<HTMLInputElement>;
  @ViewChild('loginPassword') loginPassword!: ElementRef<HTMLInputElement>;
  @ViewChild('profileControls') profileControls!: ElementRef<HTMLSelectElement>;
  @ViewChild(SocialComponent) socialComponent!: SocialComponent;
  @ViewChild(MediaSelectorComponent) displayPictureSelector!: MediaSelectorComponent;
  @ViewChild(MediaSelectorComponent) backgroundPictureSelector!: MediaSelectorComponent;

  updateUserDivVisible = true;
  notifications: Array<string> = [];
  usersCount: string | null = null;
  isGeneralToggled = false;
  isNicehashApiKeysToggled = false;
  isWeatherLocationToggled = false;
  isMenuIconsToggled = true;
  isFriendRequestsExpanded = false;
  isAboutOpen = false;
  isFriendsPanelOpen = false;
  isAboutPanelOpen = false;
  isMoreInfoOpen = false;
  isEditingFriends = false;
  hasFriendRequests = false;
  isBeingFollowedByUser = false;
  isDisplayingNSFW = false;
  isMenuPanelOpen = false;
  showingFollowingList = false;
  showingFollowersList = false;
  showingFriendsList = true;
  friends: User[] = [];
  friendRequests: FriendRequest[] = [];
  friendRequestsSent: FriendRequest[] = [];
  friendRequestsReceived: FriendRequest[] = [];
  contacts: Contact[] = [];
  isMusicContainerExpanded = false;
  isAboutExpanded = true;
  isTrophyExpanded = false;
  playListCount = 0;
  playListFirstFetch = true;
  justLoggedIn = false;
  songPlaylist: Todo[] = [];
  trophies?: Trophy[] = undefined;
  numberOfNexusBases: number = 0;
  numberOfTrades: number = 0;
  numberOfMastermindGames?: number = undefined;
  numberOfFilesUploaded?: number = undefined;
  numberOfMemesUploaded?: number = undefined;
  numberOfArtUploaded?: number = undefined;
  numberOfFavouritesCreated?: number = undefined;
  numberOfReactions?: number = undefined;
  numberOfTopEntriesCreated?: number = undefined;
  numberOfRomsUploaded?: number = undefined;
  bestEnderScore?: any = undefined;
  wordlerStreak: number = 0;
  bestWordlerStreak: number = 0;
  metaBotLevelsSum: number = 0;
  userLoginStreakCurrent: number = 0;
  userLoginStreakLongest: number = 0;
  // Emulation stats (populated from server if available)
  emulationTotalTimeSeconds?: number = 0;
  topEmulationGameName?: string | null = null;
  topEmulationGamePlays?: number | null = null;
  // Breakdown per game (populated on demand when user clicks)
  emulationGameBreakdown: Array<{ romFileName: string; totalSeconds: number; plays: number }> = [];
  isEmulationBreakdownOpen = false;
  weatherLocation?: { city: string; country: string } = undefined;
  isUserBlocked = false;
  stoppedNotifications: number[] = [];
  showHiddenFiles: boolean = false;
  filter = {
    hidden: this.showHiddenFiles ? 'yes' : 'no',
  };
  latestSocialStoryId?: number = undefined;
  wordlerHighScores?: any = undefined;
  latestMemeId?: number = undefined;
  changedTheme = false;
  private originalBackgroundColor: string | null = null;
  isDisplayPicturePanelOpen: boolean = false;
  showDisplayPictureSelector = false;
  showBackgroundPictureSelector = false;

  constructor(private userService: UserService,
    private nexusService: NexusService,
    private tradeService: TradeService,
    private contactService: ContactService,
    private weatherService: WeatherService,
    private notificationService: NotificationService,
    private friendService: FriendService,
    private wordlerService: WordlerService,
    private todoService: TodoService,
    private metaService: MetaService,
    private socialService: SocialService,
    private fileService: FileService,
    private mastermindService: MastermindService,
    private enderService: EnderService,
    private favouriteService: FavouriteService,
    private topService: TopService,
    private romService: RomService,
    private reactionService: ReactionService,
  ) {
    super();
    setTimeout(() => {
      this.removeBorderOnSocial();
    }, 50);
    setTimeout(() => {
      this.removeBorderOnSocial();
    }, 500);
    const parent = this.inputtedParentRef ?? this.parentRef;
    parent?.setViewportScalability(false);
  }

  async ngOnInit() {
    if (this.inputtedParentRef) {
      this.parentRef = this.inputtedParentRef;
    }
    this.startLoading();
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
        this.loadContactsData();
        this.loadLocation(this.user);
        this.getIsBeingFollowedByUser();
        this.getIsUserBlocked(this.user);
        this.getUserLoginStreak();

        if (this.user.id == this.parentRef?.user?.id && this.user.id != 0 && this.user.id !== undefined) {
          this.notificationService.getStoppedNotifications(this.user.id).then(res => this.stoppedNotifications = res);
        }
        this.changeTheme();
        this.setBackgroundImage();
      }
      if (!this.user) {
        this.usersCount = await this.userService.getUserCount(); 
        const lidRes = await this.socialService.getLatestStoryId();
        if (lidRes) {
          this.latestSocialStoryId = parseInt(lidRes);
        }
        this.wordlerHighScores = await this.wordlerService.getAllScores();
        const lmRes = await this.fileService.getLatestMemeId();
        if (lmRes) {
          this.latestMemeId = parseInt(lmRes);
        }
      } else {
        this.latestSocialStoryId = undefined;
      }
      this.getNSFWValue();
    }
    catch (error) { console.log((error as Error).message); }
    this.stopLoading();

    document.addEventListener('DOMContentLoaded', function () {
      if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        document.querySelectorAll('#loginInput, #passwordInput').forEach(el => {
          el.addEventListener('focus', function () {
            document.querySelector('meta[name="viewport"]')?.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
          });
        });
      }
    });
  }

  private async loadExtraCounts() {
    const user = this.user ?? this.parentRef?.user ?? this.inputtedParentRef?.user;
    if (!user || !user.id) return;

    try {
      this.numberOfMastermindGames = await this.mastermindService.getNumberOfGames(user.id);

      this.numberOfFilesUploaded = await this.fileService.getNumberOfFiles(user.id);

      this.numberOfMemesUploaded = await this.fileService.getNumberOfMemes(user.id);

      this.numberOfArtUploaded = await this.fileService.getNumberOfArt(user.id);

      this.numberOfFavouritesCreated = await this.favouriteService.getFavouritesCount(user.id);
      
      this.numberOfReactions = await this.reactionService.getReactionsCount(user.id);

      this.numberOfTopEntriesCreated = await this.topService.getEntriesCountByUser(user.id);

      this.enderService.getBestScoreForUser(user.id).then(be => {
        if (be) {
          this.bestEnderScore = be;
        }
      });

      this.romService.getUserEmulationStats(user.id).then(stats => {
        if (stats) {
          this.emulationTotalTimeSeconds = stats.totalSeconds ?? 0;
          this.topEmulationGameName = stats.topGameName ?? null;
          this.topEmulationGamePlays = stats.topGamePlays ?? null;
          this.numberOfRomsUploaded = stats.romCount ?? 0;
        }
      });

      // Breakdown will be fetched on demand when user clicks the top-game area

      if ((this.numberOfMemesUploaded === undefined || this.numberOfMemesUploaded === null)) {
        this.numberOfMemesUploaded = 0;
      }
    } catch (e) { }
  }

  // Toggle the emulation breakdown list; fetch from server on first open
  async toggleEmulationBreakdown() {
    if (!this.user || !this.user.id) return;
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (this.isEmulationBreakdownOpen) {
      // Close popup and overlay
      this.isEmulationBreakdownOpen = false;
      parent?.closeOverlay();
      return;
    }
    // Open popup, show overlay and fetch breakdown
    this.isEmulationBreakdownOpen = true;
    parent?.showOverlay();
    try {
      const data = await this.romService.getUserEmulationBreakdown(this.user.id);
      if (Array.isArray(data)) {
        this.emulationGameBreakdown = data.map((d: any) => ({ romFileName: d.romFileName ?? d.rom_file_name ?? d.rom_fileName ?? '', totalSeconds: d.totalSeconds ?? 0, plays: d.plays ?? 0 }));
      } else {
        this.emulationGameBreakdown = [];
      }
    } catch (e) {
      this.emulationGameBreakdown = [];
    }
  }

  closeEmulationBreakdownPopup() {
    this.isEmulationBreakdownOpen = false; 
  }


  private getUserLoginStreak() {
    this.userService.getLoginStreak(this.user?.id ?? 0).then(streakRes => {
      if (streakRes) {
        this.userLoginStreakCurrent = streakRes.currentStreak ?? 0;
        this.userLoginStreakLongest = streakRes.longestStreak ?? 0;
      }
    });
  }

  private async changeTheme() {
    // First reset to default settings
    this.resetToDefaultTheme();

    // Then apply new theme if conditions are met
    if (this.user?.id != this.parentRef?.user?.id && this.user?.id !== undefined) {
      const theme = await this.userService.getTheme(this.user?.id);
      if (theme) {
        this.parentRef?.navigationComponent.getThemeInfo(this.user.id ?? 0);
        this.changedTheme = true;
      }
    }

    // Apply profile background effects if they exist
    if (this.user?.profileBackgroundPictureFile) {
      this.applyProfileBackgroundEffects();
    }
  }

  private resetToDefaultTheme() {
    // Reset background
    this.restoreBackground();

    // Reset text shadows and other theme-specific styles
    const resetElements = [
      ...Array.from(document.getElementsByClassName('closeButton')),
      ...Array.from(document.getElementsByClassName('componentTitle')),
      ...Array.from(document.getElementsByClassName('menuButton'))
    ];

    resetElements.forEach(element => {
      if (element instanceof HTMLElement) {
        element.style.removeProperty('text-shadow');
      }
    });

    // Reset any other theme-specific properties
    const mainElement = document.querySelector('.componentMain') as HTMLDivElement;
    if (mainElement) {
      mainElement.style.removeProperty('--main-link-color');
      // Add any other CSS variables you need to reset
    }

    this.changedTheme = false;
  }

  private applyProfileBackgroundEffects() {
    if (this.loginOnly) return;
    const closeButton = document.getElementsByClassName('componentMain')[0]?.getElementsByClassName('closeButton')[0] as HTMLDivElement;
    if (closeButton) {
      closeButton.style.setProperty('text-shadow', '1px 1px var(--main-link-color)');
    }

    const titleComponent = document.getElementsByClassName('componentMain')[0]?.getElementsByClassName('componentTitle')[0] as HTMLDivElement;
    if (titleComponent) {
      titleComponent.style.setProperty('text-shadow', '1px 1px var(--main-link-color)');
    }

    const menuButton = document.getElementsByClassName('componentMain')[0]?.getElementsByClassName('menuButton')[0] as HTMLDivElement;
    if (menuButton) {
      menuButton.style.setProperty('text-shadow', '1px 1px var(--main-link-color)');
    }
  }

  private setBackgroundImage() {
    if (this.user?.profileBackgroundPictureFile?.id && !this.loginOnly) {
      const element = document.querySelector('.componentMain') as HTMLDivElement;
      if (element) {
        // Store original value first
        this.originalBackgroundColor = element.style.backgroundColor;
        element.style.setProperty('background-color', 'unset', 'important');
      }
    }
  }

  private restoreBackground() {
    const element = document.querySelector('.componentMain') as HTMLDivElement;
    if (element && this.originalBackgroundColor !== null) {
      if (this.originalBackgroundColor) {
        element.style.setProperty('background-color', this.originalBackgroundColor, 'important');
      } else {
        element.style.removeProperty('background-color');
      }
    }
  }

  private async loadLocation(user: User) {
    let gotLoc = false;
    const wRes = await this.weatherService.getWeatherLocation(user.id ?? 0);
    if (wRes) {
      this.weatherLocation = { city: wRes.city, country: wRes.country };
      gotLoc = true;
    }
    if (!gotLoc) {
      this.parentRef?.getLocation(this.user).then(res => {
        if (res?.city) {
          this.weatherLocation = res;
        }
      });
    }
  }

  ngOnDestroy() {
    if (this.justLoggedIn) {
      const parent = this.parentRef ?? this.inputtedParentRef;
      if (parent && parent.navigationComponent) {
        parent.navigationComponent.getNotifications();
      }
    }
    if (this.changedTheme) {
      this.parentRef?.navigationComponent.getThemeInfo(this.parentRef.user?.id ?? 0);
      this.restoreBackground();
    }
  }

  override remove_me(title: string) {
    this.closeUserComponentEvent.emit();
    super.remove_me(title);
  }
  async getTrophies() {
    const user = this.user ?? this.inputtedParentRef?.user ?? this.parentRef?.user;
    if (user?.id) {
      this.userService.getTrophies(user.id).then(res => {
        if (res) {
          this.trophies = res as Trophy[];
        } else {
          this.trophies = [];
        }
      })
    } else {
      this.trophies = [];
    }
  }
  async gotPlaylistEvent(event: Array<Todo>) {
    this.playListCount = event.length;
  }
  async loadSongData() {
    const user = this.user ?? this.parentRef?.user;
    if (!user?.id) return;
    try {
      const res = await this.todoService.getTodo(user.id, "Music");
      if (res) {
        this.songPlaylist = res;
      }
    } catch (e) { }
  }
  async loadContactsData() {
    try {
      if (this.parentRef && this.parentRef.user?.id) {
        const res = await this.contactService.getContacts(this.parentRef.user.id);

        if (res) {
          this.contacts = res;
        }
      }
    } catch (e) { }
  }
  async loadWordlerData() {
    const user = this.user ?? this.parentRef?.user;
    if (user?.id) {
      try {
        const wsRes = await this.wordlerService.getBestConsecutiveDayStreak(user.id);
        if (wsRes) {
          this.bestWordlerStreak = parseInt(wsRes);
        }

        const wsRes2 = await this.wordlerService.getTodaysDayStreak(user.id);
        if (wsRes2) {
          this.wordlerStreak = parseInt(wsRes2);
        }
      } catch (e) { }
    }
  }

  async loadMetaheroData() {
    const user = this.user ?? this.parentRef?.user;
    if (user?.id) {
      try {
        const mhRes = await this.metaService.getHero(user.id);
        if (mhRes) {
          let sum = 0;
          for (let bot of mhRes.metabots) {
            sum += bot.level;
          }
          this.metaBotLevelsSum = sum;
        }
      } catch (e) { }
    }
  }

  async loadFriendData() {
    this.hasFriendRequests = false;
    const user = this.user ?? this.parentRef?.user ?? this.inputtedParentRef?.user;

    if (user?.id) {
      this.friends = await this.friendService.getFriends(user.id);
      const res = await this.friendService.getFriendRequests(user.id);
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
    const isOpen = event === "aboutContainer" ? this.isAboutExpanded
      : event === "musicProfileContainer" ? this.isMusicContainerExpanded
        : this.isTrophyExpanded;


    if (event === "aboutContainer") {
      this.isAboutExpanded = !!!isOpen;
    } else if (event === "musicProfileContainer") {
      this.isMusicContainerExpanded = !!!isOpen;
    } else if (event === "trophyContainer") {
      this.isTrophyExpanded = !!!isOpen;
    }
  }

  async addContact(user: User) {
    const userId = this.parentRef?.user?.id;
    if (userId) {
      const res = await this.contactService.addUserContact(userId, user.id ?? 0);
      this.parentRef?.showNotification(res);
    }
  }

  async blockContact(user: User) {
    const userId = this.parentRef?.user?.id;
    if (userId) {
      const res = await this.userService.blockUser(userId, user.id ?? 0);
      if (res) {
        this.parentRef?.showNotification(res);
        this.isUserBlocked = true;
      }
    }
  }
  async unblockContact(user: User) {
    const userId = this.parentRef?.user?.id;
    if (userId) {
      const res = await this.userService.unblockUser(userId, user.id ?? 0);
      if (res) {
        this.parentRef?.showNotification(res);
        this.isUserBlocked = false;
      }
    }
  }
  async getIsUserBlocked(user: User) {
    const userId = this.parentRef?.user?.id;
    if (userId) {
      await this.userService.isUserBlocked(userId, user.id ?? 0).then(res => {
        if (res) {
          this.isUserBlocked = res.isBlocked;
        }
      });

    }
  }


  canAddFriend(user: User) {
    let found = false;
    if (Array.isArray(this.friends)) {
      this.friends?.forEach(x => {
        if (x.username == this.parentRef?.user?.username) {
          found = true;
        }
      });
    }

    if (Array.isArray(this.friendRequests)) {
      this.friendRequests?.forEach(x => {
        if (x.sender.username == this.parentRef?.user?.username) {
          found = true;
        }
      });
    }
    return !found;
  }

  friendsIncludeMe() {
    if (!Array.isArray(this.friends)) {
      return false;
    }

    return this.friends.some(x => x.username === this.parentRef?.user?.username);
  }

  contactsContains(user: User) {
    if (this.contacts?.some(x => x.user!.id == user.id)) {
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
    this.parentRef?.showNotification("Logged out successfully, refresh in 100 milliseconds.");

    setTimeout(() => {
      window.location.reload();
    }, 100);
  }


  async acceptFriendshipRequest(request: FriendRequest) {
    const res = await this.friendService.acceptFriendRequest(request.sender.id ?? 0, request.receiver.id ?? 0);
    this.parentRef?.showNotification(res);
    await this.ngOnInit();
  }
  async denyFriendshipRequest(request: FriendRequest) {
    const res = await this.friendService.rejectFriendRequest(request.sender.id ?? 0, request.receiver.id ?? 0);
    this.parentRef?.showNotification(res);
    await this.ngOnInit();
  }
  async deleteFriendshipRequest(request: FriendRequest) {
    const res = await this.friendService.deleteFriendRequest(request.id);
    this.parentRef?.showNotification(res);
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
      case 'unfollow':
        this.unfollowUser(this.user);
        break;
      case 'addContact':
        if (this.user) {
          this.addContact(this.user);
        }
        break;
      case 'blockContact':
        if (this.user) {
          this.blockContact(this.user);
        }
        break;
      case 'unblockContact':
        if (this.user) {
          this.unblockContact(this.user);
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
        this.openSettingsPanel();
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


  openSettingsPanel() {
    this.parentRef?.createComponent('UpdateUserSettings', {
      showOnlySelectableMenuItems: false,
      areSelectableMenuItemsExplained: false,
      inputtedParentRef: this.parentRef,
      previousComponent: "User"
    });
  }

  async addFriend(userToAdd: User) {
    const user = this.parentRef?.user;
    if (user?.id && userToAdd.id) {
      const res = await this.friendService.sendFriendRequest(user.id, userToAdd.id);
      this.parentRef?.showNotification(res);
      await this.ngOnInit();
    } else {
      this.parentRef?.showNotification("You must be logged in to send a friendship request");
    }
  }
  async removeFriend(userToRemove?: User) {
    const user = this.parentRef?.user;
    if (!userToRemove?.id || !user?.id) return;
    if (this.parentRef && this.parentRef.user) {
      const res = await this.friendService.removeFriend(user.id, userToRemove.id);
      this.parentRef?.showNotification(res);
      await this.loadFriendData();
    } else {
      this.parentRef?.showNotification("You must be logged in to remove a friend");
    }
  }
  async unfollowUser(user?: User) {
    if (!user) return alert("You must select a user to unfollow first!");
    const parent = this.parentRef ?? this.inputtedParentRef;
    const parentUser = parent?.user;
    if (parentUser) {
      const tgtFollowRequest = this.friendRequests.filter(x => x.sender.id == parentUser.id)[0];
      if (tgtFollowRequest) {
        this.deleteFriendshipRequest(tgtFollowRequest);
      }
    }
  }

  async createUser(guest?: boolean) {
    let tmpUserName = this.loginUsername.nativeElement.value;
    const tmpPassword = this.loginPassword.nativeElement.value;
    const parent = this.parentRef ?? this.inputtedParentRef;
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
          await this.userService.addMenuItem(tmpUser.id, ["Social", "Meme", "Wordler", "Files", "Emulation", "Bug-Wars", "Crypto-Hub", "Notifications", "Help"]);
          await this.login(guest ? tmpUserName : undefined, true);
          parent?.getLocation();
          setTimeout(() => {
            if (parent) {
              parent.navigationComponent.displayAppSelectionHelp(true);
            }
            this.remove_me("User");
          }, 50);
        } else {
          parent?.showNotification(`${JSON.parse(resCreateUser!)["message"]}`);
        }
      } catch (error: any) {
        const message = error["message"];
        if (message.includes("409")) {
          parent?.showNotification(`User already exists`);
        } else {
          parent?.showNotification(`Error: ${message}`);
        }
      }
    }
  }

  async getLoggedInUser() {
    if (this.parentRef!.getCookie("user")) {
      this.parentRef!.user = JSON.parse(this.parentRef!.getCookie("user"));
    }
  }

  async login(guest?: string, fromUserCreation?: boolean) {
    if (this.parentRef?.user) {
      this.parentRef.user = undefined;
    }
    let success = false;
    let tmpUserName = this.loginUsername.nativeElement.value;
    if (guest) {
      tmpUserName = guest;
    }
    try {
      const tmpUser = await this.userService.login(tmpUserName, this.loginPassword.nativeElement.value) as User;

      if (tmpUser && tmpUser.username && this.parentRef) {
        tmpUser.pass = undefined;
        this.parentRef.user = tmpUser;
        this.parentRef.navigationComponent.getThemeInfo(); 
        this.parentRef.resetUserCookie();
        this.parentRef.showNotification(`Access granted. Welcome ${(fromUserCreation ? 'to BugHosted' : 'back')} ${this.parentRef!.user?.username}`);
        this.parentRef.getLocation();
        this.parentRef.getSessionToken();
        this.parentRef.userSelectedNavigationItems = await this.userService.getUserMenu(tmpUser.id);
        this.resetNavigationAppSelectionHelp();
        if (this.loginOnly) {
          this.closeUserComponentEvent.emit(tmpUser);
        }
        this.latestSocialStoryId = undefined;
        success = true;
      } else {
        this.parentRef?.showNotification("Access denied");
      }

    } catch (e) {
      this.parentRef?.showNotification("Login error: " + e);
    } finally {
      if (success) {
        this.justLoggedIn = true;
        this.ngOnInit();
      }
    }
  }
  private resetNavigationAppSelectionHelp() {
    if (this.parentRef?.navigationComponent) {
      this.parentRef.navigationComponent.showAppSelectionHelp = false;
      setTimeout(() => {
        if (this.parentRef?.navigationComponent) {
          this.parentRef.navigationComponent.displayAppSelectionHelp();
        }
      }, 50);
    }
  }

  getNewFriendRequestCount() {
    const count = this.friendRequests.filter(x => x.status == 3).length;
    return count > 0 ? `(${count})` : '';
  }
  copyLink() {
    const userId = this.user?.id ?? this.userId ?? this.parentRef?.user?.id;
    const link = `https://bughosted.com/${userId ? `User/${userId}` : ''}`;
    try {
      navigator.clipboard.writeText(link).then(() => {
        this.parentRef?.showNotification('Link copied to clipboard!');
      }).catch(err => {
        this.parentRef?.showNotification('Failed to copy link!');
      });
    }
    catch {
      this.parentRef?.showNotification('Failed to copy link!');
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
  openFriendsPanel() {
    this.isFriendsPanelOpen = true;
    const parent = this.parentRef ?? this.inputtedParentRef;
    if (parent) {
      parent.showOverlay();
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
    this.loadWordlerData();
    this.loadMetaheroData();
    this.loadSongData();
    this.getNumberOfNexusBases();
    this.getNumberOfTrades();
    this.loadExtraCounts();
    if (!this.trophies) {
      this.getTrophies();
    }
    this.isAboutPanelOpen = true;
    const parent = this.parentRef ?? this.inputtedParentRef;
    if (parent) {
      parent.showOverlay();
    }
  }
  closeAboutPanel() {
    this.isAboutPanelOpen = false;
    const parent = this.parentRef ?? this.inputtedParentRef;
    if (parent) {
      parent.closeOverlay();
    }
    this.isTrophyExpanded = false;
    this.isAboutExpanded = false;
    this.isFriendRequestsExpanded = false;
    this.isMusicContainerExpanded = false;
  }
  isFollowingUser() {
    const parent = this.parentRef ?? this.inputtedParentRef;
    const parentUser = parent?.user;
    if (parentUser) {
      const tgtFollowRequest = this.friendRequests.filter(x => x.sender.id == parentUser.id)[0];
      if (tgtFollowRequest) {
        return true;
      }
    }
    return false;
  }
  async getIsBeingFollowedByUser() {
    const parent = this.parentRef ?? this.inputtedParentRef;
    const parentUser = parent?.user;
    if (parentUser?.id && this.user) {
      // friendRequests may not have been loaded yet; if empty, skip and let later invocation set flag
      if (!this.friendRequests || this.friendRequests.length === 0) {
        this.isBeingFollowedByUser = false;
        return;
      }
  const tgtFollowRequest = this.friendRequests.find(x => x.sender.id === this.user?.id);
      if (tgtFollowRequest) {
        this.isBeingFollowedByUser = true;
        return;
      }
    }
    this.isBeingFollowedByUser = false;
  }
  showMenuPanel() {
    if (this.isMenuPanelOpen) {
      this.closeMenuPanel();
      return;
    }
    this.isMenuPanelOpen = true;
    this.parentRef?.showOverlay();
    this.inputtedParentRef?.showOverlay();
  }
  closeMenuPanel() {
    this.isMenuPanelOpen = false;
    this.parentRef?.closeOverlay();
    this.inputtedParentRef?.closeOverlay();
  }
  private getNumberOfNexusBases() {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = this.user ?? parent?.user;
    if (user?.id) {
      this.nexusService.getNumberOfBases(user.id).then(res => {
        if (res) {
          this.numberOfNexusBases = res ?? 0;
        }
      });
    }
  }
  private getNumberOfTrades() {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = this.user ?? parent?.user;
    if (user?.id) {
      this.tradeService.getNumberOfTrades(user.id).then(res => {
        if (res) {
          this.numberOfTrades = res ?? 0;
        }
      });
    }
  }
  setFilterHidden(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.filter.hidden = target.value;
    const showHidden = this.filter.hidden == "yes";

    this.socialComponent.getStories(undefined, undefined, undefined, undefined, undefined, showHidden);
  }
  isUserOnline(lastSeen: string): boolean {
    const parent = this.inputtedParentRef ?? this.parentRef;
    return parent?.isUserOnline(lastSeen) ?? false;
  }

  private getNSFWValue() {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = parent?.user;
    if (user && user.id) {
      this.userService.getUserSettings(user.id).then(res => {
        if (res) {
          this.isDisplayingNSFW = res.nsfwEnabled ?? false;
        }
      });
    }
  }
  async updateNSFW(event: Event) {
    const user = this.parentRef?.user;
    if (!user || !user.id) return alert("You must be logged in to view NSFW content.");
    const isChecked = (event.target as HTMLInputElement).checked;
    this.isDisplayingNSFW = isChecked;
    this.userService.updateNSFW(user.id, isChecked).then(res => {
      if (res) {
        this.parentRef?.showNotification(res);
      }
    });
  }

  private removeBorderOnSocial() {
    const tgtElement = document.getElementsByClassName("componentMain")[1];
    if (tgtElement) {
      (tgtElement as HTMLDivElement).style.border = "unset";
    }
  }

  preventNotifications(frReq: FriendRequest) {
    if (!this.parentRef?.user?.id) return alert("You must be logged in");
    if (!frReq.receiver.id || !frReq.sender.id) return alert("Data mismatch error.");
    const user = frReq.receiver.id != this.parentRef.user.id ? frReq.receiver : frReq.sender;
    this.notificationService.stopNotifications(this.parentRef.user.id, user.id ?? 0).then(res => {
      if (res) {
        this.parentRef?.showNotification(`You will no longer see notifications from ${user.username}`);
        this.stoppedNotifications.push(user.id ?? 0);
        this.closeFriendsPanel();
      }
    })
  }

  async allowNotifications(frReq: FriendRequest) {
    if (!this.parentRef?.user?.id) return alert("You must be logged in");
    if (!frReq.receiver.id || !frReq.sender.id) return alert("Data mismatch error.");
    const user = frReq.receiver.id != this.parentRef.user.id ? frReq.receiver : frReq.sender;
    await this.notificationService.allowNotifications(this.parentRef.user.id, user.id ?? 0).then(res => {
      if (res !== undefined) {
        this.parentRef?.showNotification(`You will now see notifications from ${user.username}`);
        this.stoppedNotifications = this.stoppedNotifications.filter(x => x == user.id);
        this.closeFriendsPanel();
      }
    })
  }
  changeDisplayPic() {
    this.closeDisplayPicturePanel();
    this.showDisplayPictureSelector = true;
    const targetParent = this.inputtedParentRef ?? this.parentRef;
    targetParent?.showOverlay();

    setTimeout(() => {
      this.displayPictureSelector.toggleMediaChoices();
    }, 50);
  }

  changeBackgroundPic() {
    this.closeDisplayPicturePanel();
    this.showBackgroundPictureSelector = true;
    const targetParent = this.inputtedParentRef ?? this.parentRef;
    targetParent?.showOverlay();

    setTimeout(() => {
      this.backgroundPictureSelector.toggleMediaChoices();
    }, 50);
  }
  openDisplayPicturePanel() {
    const targetParent = this.inputtedParentRef ?? this.parentRef;
    if (!(this.user && this.user.id == this.parentRef?.user?.id)) {
      return;
    }
    this.isDisplayPicturePanelOpen = true;
    targetParent?.showOverlay();
  }
  closeDisplayPicturePanel() {
    this.isDisplayPicturePanelOpen = false;
    const targetParent = this.inputtedParentRef ?? this.parentRef;
    targetParent?.closeOverlay();
    setTimeout(() => {
      if (!this.showBackgroundPictureSelector && !this.showDisplayPictureSelector) {
        this.showBackgroundPictureSelector = false;
        this.showDisplayPictureSelector = false;
      }
    });
  }
  async avatarSelected(files: FileEntry[]) {
    const targetParent = this.parentRef ?? this.inputtedParentRef;
    if (files && files.length > 0 && targetParent?.user?.id) {
      await this.userService.updateDisplayPicture(targetParent.user.id, files[0].id);
      targetParent.user.displayPictureFile = files[0];
      targetParent.deleteCookie("user");
      targetParent.setCookie("user", JSON.stringify(targetParent.user), 10);
      setTimeout(() => { this.ngOnInit(); }, 100);
    }
    this.showDisplayPictureSelector = false;
    targetParent?.closeOverlay();
  }
  async profileBackgroundSelected(files: FileEntry[]) {
    const targetParent = this.parentRef ?? this.inputtedParentRef;
    if (files && files.length > 0 && targetParent?.user?.id) {
      await this.userService.updateProfileBackgroundPicture(targetParent.user.id, files[0].id);
      targetParent.user.profileBackgroundPictureFile = files[0];
      targetParent.deleteCookie("user");
      targetParent.setCookie("user", JSON.stringify(targetParent.user), 10);
      setTimeout(() => { this.ngOnInit(); }, 100);
    }
    this.showBackgroundPictureSelector = false;
    targetParent?.closeOverlay();
  }
  showTrophies() {
    this.openAboutPanel();
    if (!this.trophies) {
      this.getTrophies();
    }
    setTimeout(() => {
      this.isTrophyExpanded = true;
    }, 50);
  }
}
