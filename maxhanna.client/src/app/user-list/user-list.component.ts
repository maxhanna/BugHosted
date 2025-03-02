import { Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { UserService } from '../../services/user.service';
import { ChatNotification } from '../../services/datacontracts/chat/chat-notification';
import { ChatService } from '../../services/chat.service';
import { ChildComponent } from '../child.component';
import { User } from '../../services/datacontracts/user/user';
import { AppComponent } from '../app.component';
import { FriendService } from '../../services/friend.service';
import { Pipe, PipeTransform } from '@angular/core';
import { Message } from '../../services/datacontracts/chat/message';


@Component({
  selector: 'app-user-list',
  templateUrl: './user-list.component.html',
  styleUrl: './user-list.component.css'
})
export class UserListComponent extends ChildComponent implements OnInit, OnDestroy {
  @Input() user?: User;
  @Input() inputtedParentRef?: AppComponent;
  @Input() chatNotifications?: ChatNotification[];
  @Input() friendsOnly: boolean = false;
  @Input() searchOnly: boolean = false;
  @Input() sharingSearch: boolean = false;
  @Input() displayOnlyFriends: boolean = true;
  @Input() displayRadioFilters: boolean = false;
  @Input() contactsOnly: boolean = false;
  @Output() userClickEvent = new EventEmitter<User | undefined>();
  @Output() userSelectClickEvent = new EventEmitter<User[] | undefined>();
  @Output() groupChatEvent = new EventEmitter<User[] | undefined>();

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;
  @ViewChild('allUsersRadio') allUsersRadio!: ElementRef<HTMLInputElement>;
  @ViewChild('friendsRadio') friendsRadio!: ElementRef<HTMLInputElement>;

  isSearchPanelOpen = false;
   
  isFriendsChecked: boolean = true;

  private chatInfoInterval: any;
  users: Array<User> = [];
  usersSearched: Array<User> = [];
  userRows: Array<User[]> = [];
  messageRows: Message[] = [];
  selectedUsers: Array<User> = [];
  filterOption: string = 'all';
  friendSelected = false;


  constructor(private userService: UserService, private chatService: ChatService, private friendService: FriendService) {
    super();
  }
  async ngOnInit() {
    if (!this.searchOnly) {
      this.getChatNotifications();
      this.chatInfoInterval = setInterval(() => this.getChatNotifications(), 30 * 1000);
      this.getUsers();
      this.sortUsersByNotifications();
      if (!this.user) {
        const parent = this.inputtedParentRef ?? this.parentRef;
        if (parent) {
          this.user = parent.user;
        }
      }
    }
  }
  async ngOnDestroy() {
    clearInterval(this.chatInfoInterval);
  }
  async searchUsers() { 
    let search = undefined;
    if (this.searchInput.nativeElement.value.trim() != '') {
      search = this.searchInput.nativeElement.value.trim();
    } 
    const fsRes = await this.userService.getAllUsers(this.user, search);
    if (fsRes) {
      this.usersSearched = fsRes;
    } else { 
      this.usersSearched = [];
    }
  }
  async getUsers() {
    const user = this.user ?? this.parentRef?.user ?? this.inputtedParentRef?.user ?? new User(0, "Anonymous");
    if (!this.friendsRadio || this.friendsRadio.nativeElement?.checked) {
      const fsRes = await this.friendService.getFriends(user);
      if (fsRes) {
        this.users = fsRes;
        if (this.users.length == 0) { 
        }
      } else {
        this.users = []; 
      }
    }
    else {
      const fsRes = await this.userService.getAllUsers(user);
      if (fsRes) {
        this.users = fsRes;
      } else {
        this.messageRows = [];
        this.users = [];
      }
    } 

    await this.chatService.getGroupChats(user).then(res => {
      if (res) {
        this.messageRows = res;
      } else {
        this.messageRows = [];
      }
    });

    if (!this.displayRadioFilters && this.messageRows.length == 0) {
      const fsRes = await this.userService.getAllUsers(user);
      if (fsRes) {
        this.users = fsRes;
      } else {
        this.messageRows = [];
        this.users = [];
      }
    }
  }

  closeOverlayOnClick(user?: User) {
    this.userClickEvent.emit(user);
    this.openChat(user);
    if (this.inputtedParentRef) {
      this.inputtedParentRef.closeOverlay();
    }
  }
  openChat(users: User | User[] | undefined) {
    if (!users) return;
    const tmpusers = Array.isArray(users) ? users : [users];
    this.groupChatEvent.emit(tmpusers);
  }

  openChatById(chatId: number | undefined) {
    if (!chatId) return;
    const tmpusers = this.messageRows.find(x => x.chatId == chatId)?.receiver;
    this.groupChatEvent.emit(tmpusers);
  }

  getChatNotificationsByChatId(chatId?: number) {
    if (chatId && this.chatNotifications && this.chatNotifications.length > 0) {
      const tmpChatNotif = this.chatNotifications.find(x => x.chatId == chatId);
      if (this.chatNotifications && tmpChatNotif) {
        return tmpChatNotif.count;
      }
    }
    return '';
  }
  getChatNotificationsByUserId(userId?: number) {
    if (!userId || !this.chatNotifications) return;
    if (userId == 1) {
      console.log(this.chatNotifications);
    }
    const tgtMessage = this.messageRows.find(x => x.receiver.some(r => r.id === userId) && x.receiver.length == 2 && x.receiver[0]);
    if (userId == 1) {
      console.log(tgtMessage);
    }
    const tmpChatNotif = this.chatNotifications.find(x => x.chatId == tgtMessage?.chatId);
    if (this.chatNotifications && tmpChatNotif) {
      return tmpChatNotif.count;
    } else return null;
  }

  async getChatNotifications() {
    if (this.user) {
      const chatNotifsRes = await this.chatService.getChatNotificationsByUser(this.user);
      if (chatNotifsRes) {
        this.chatNotifications = chatNotifsRes;
      }
    }
  }
  private sortUsersByNotifications() {
    if (this.chatNotifications && this.chatNotifications.length > 0) {
      const userNotificationCount = this.chatNotifications!.reduce((acc: { [key: number]: number }, notification) => {
        acc[notification.chatId] = (acc[notification.chatId] || 0) + 1;
        return acc;
      }, {});
      this.users.sort((a, b) => {
        const countA = userNotificationCount[a.id!] || 0;
        const countB = userNotificationCount[b.id!] || 0;

        if (countA === countB) {
          return a.id! - b.id!;
        }
        return countB - countA;
      });
    }
  }
 
  async filterUsers() {
    this.isFriendsChecked = this.friendsRadio?.nativeElement.checked || false;
    if (this.searchInput && this.searchInput.nativeElement) {
      this.searchInput.nativeElement.value = "";
    } 
    this.getUsers();
  }
  openSearchPanel() {
    this.isSearchPanelOpen = true;
    const parent = this.parentRef ?? this.inputtedParentRef;
    if (parent) {
      parent.showOverlay();
    }
    setTimeout(() => {
      this.searchInput.nativeElement.focus();
    }, 50);
  }
  closeSearchPanel() {
    this.isSearchPanelOpen = false;
    const parent = this.parentRef ?? this.inputtedParentRef;
    if (parent) {
      parent.closeOverlay();
    }
  }
  getCommaSeparatedGroupChatUserNames(users: User | User[], includeCurrentUser?: boolean): string {
    return this.chatService.getCommaSeparatedGroupChatUserNames(users, this.user, includeCurrentUser);
  }
  removeSelfFromReceivers(users?: User[]) {
    if (!users) return users;
    if (users.length == 2 && users[0].id === users[1].id) { 
      return [users[0]];
    }
    const user = this.inputtedParentRef?.user ?? this.parentRef?.user ?? new User(0, "Anonymous");
    return users.filter(x => x.id != user.id);
  }
}
