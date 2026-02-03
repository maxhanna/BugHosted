import { Component, ElementRef, EventEmitter, Injector, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { UserService } from '../../services/user.service';
import { ChatNotification } from '../../services/datacontracts/chat/chat-notification';
import { ChatService } from '../../services/chat.service';
import { ChildComponent } from '../child.component';
import { User } from '../../services/datacontracts/user/user';
import { AppComponent } from '../app.component';
import { FriendService } from '../../services/friend.service'; 
import { Message } from '../../services/datacontracts/chat/message'; 


@Component({
    selector: 'app-user-list',
    templateUrl: './user-list.component.html',
    styleUrl: './user-list.component.css',
    standalone: false
})
export class UserListComponent extends ChildComponent implements OnInit, OnDestroy {
  @Input() user?: User;
  @Input() inputtedParentRef?: AppComponent;
  @Input() chatNotifications?: ChatNotification[];
  @Input() friendsOnly: boolean = false;
  @Input() searchOnly: boolean = false;
  @Input() sharingSearch: boolean = false;
  @Input() displayOnlyFriends: boolean = true;
  @Input() hidePreviousMessages: boolean = false;
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


  constructor(private userService: UserService, private chatService: ChatService, private friendService: FriendService, private injector: Injector) {
    super(); 
  }
  async ngOnInit() {
    if (this.inputtedParentRef) {
      this.parentRef = this.inputtedParentRef;  
      this.parentRef?.addResizeListener();
    }
    if (!this.searchOnly) {
      this.getChatNotifications();
      this.chatInfoInterval = setInterval(() => this.getChatNotifications(), 30 * 1000);
      this.getUsers();
      this.sortUsersByNotifications();
      if (!this.user) {
        const parent = this.inputtedParentRef ?? this.parentRef;
        if (parent) {
          this.user = parent.user;
          parent.addResizeListener();
        }
      }
    }
  }
  async ngOnDestroy() {
    clearInterval(this.chatInfoInterval);
    const parent = this.inputtedParentRef ?? this.parentRef;
    parent?.removeResizeListener();
  }
  async searchUsers() { 
    this.startLoading();
    let search = undefined;
    if (this.searchInput.nativeElement.value.trim() != '') {
      search = this.searchInput.nativeElement.value.trim();
    } 
    const fsRes = await this.userService.getAllUsers(this.inputtedParentRef?.user?.id ?? this.parentRef?.user?.id, search);
    if (fsRes) {
      this.usersSearched = fsRes;
    } else { 
      this.usersSearched = [];
    }
    this.stopLoading();
  }
  async getUsers() {
    this.startLoading();
    const user = this.user ?? this.parentRef?.user ?? this.inputtedParentRef?.user ?? new User(0, "Anonymous");
    if (!this.friendsRadio || this.friendsRadio.nativeElement?.checked) {
      const fsRes = await this.friendService.getFriends(user.id ?? 0);
      if (fsRes) {
        this.users = fsRes;
        if (this.users.length == 0) { 
        }
      } else {
        this.users = []; 
      }
    }
    else {
      const fsRes = await this.userService.getAllUsers(this.inputtedParentRef?.user?.id ?? this.parentRef?.user?.id);
      if (fsRes) {
        this.users = fsRes;
      } else {
        this.messageRows = [];
        this.users = [];
      }
    } 

    await this.chatService.getGroupChats(user.id).then(res => {
      if (res) {
        this.messageRows = res;
      } else {
        this.messageRows = [];
      }
    });

    if (!this.displayRadioFilters && this.messageRows.length == 0) {
      const fsRes = await this.userService.getAllUsers(this.inputtedParentRef?.user?.id ?? this.parentRef?.user?.id);
      if (fsRes) {
        this.users = fsRes;
      } else {
        this.messageRows = [];
        this.users = [];
      }
    }
    this.stopLoading();
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
    }
    const tgtMessage = this.messageRows.find(x => x.receiver.some(r => r.id === userId) && x.receiver.length == 2 && x.receiver[0]); 
    const tmpChatNotif = this.chatNotifications.find(x => x.chatId == tgtMessage?.chatId);
    if (this.chatNotifications && tmpChatNotif) {
      return tmpChatNotif.count;
    } else return null;
  }

  async getChatNotifications() {
    if (this.user) {
      const chatNotifsRes = await this.chatService.getChatNotificationsByUser(this.user.id);
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
    // const parent = this.parentRef ?? this.inputtedParentRef;
    // if (parent) {
    //   parent.closeOverlay();
    // }
    // setTimeout(() => {
    //   this.isSearchPanelOpen = true;
    //   setTimeout(() => {
    //     parent?.showOverlay();
    //     this.searchInput?.nativeElement?.focus();
    //   }, 50);
      
    // }, 50);
  }
  closeSearchPanel() {
    console.log("close search poanel");
    if (!this.sharingSearch) { 
      this.isSearchPanelOpen = false;
    } else {
      this.userClickEvent.emit();
    }
    this.usersSearched = []; 
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

    const tmpUserList = users.filter(x => x.id != user.id && user.username?.toLowerCase() != "unknown"); 
    return tmpUserList.filter((user, index, self) =>
      index === self.findIndex(u => u.id === user.id) 
    );  
  }
  getOnlineUserCount() {
    const parent = this.inputtedParentRef ?? this.parentRef;
    return this.users.filter(user => {
      if (user.lastSeen) {
        // Apply the timeSince pipe to lastSeen
        const timeSinceValue = this.timeSinceTransform(user.lastSeen);
        return parent?.isUserOnline(timeSinceValue);
      }
      return false;
    }).length;
  }

  getOnlineUserCountFromMessageRows() {
    const parent = this.inputtedParentRef ?? this.parentRef;
    // Use a Set to avoid counting the same user multiple times
    const onlineReceivers = new Set<number>();

    this.messageRows.forEach(message => {
      const receivers = message.receiver || []; // Handle case where receiver array might be undefined
      receivers.forEach(receiver => {
        if (receiver.lastSeen) {
          const timeSinceValue = this.timeSinceTransform(receiver.lastSeen);
          if (parent?.isUserOnline(timeSinceValue)) {
            onlineReceivers.add(receiver.id ?? 0); 
          }
        }
      });
    });

    return onlineReceivers.size;
  }


  private timeSinceTransform(date?: Date | string, granularity: 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second' = 'minute'): string {
    if (!date) return "0";

    const dateObj = this.parseDate(date);
    if (!dateObj || isNaN(dateObj.getTime())) return "0";

    return this.calculateTimeSince(dateObj, granularity);
  }

  private parseDate(date: Date | string): Date {
    if (date instanceof Date) return date;

    // Handle ISO strings (with or without 'Z') and other formats
    if (typeof date === 'string') {
      // If it's already in ISO format with timezone info
      if (date.includes('Z') || date.includes('+')) {
        return new Date(date);
      }
      // If it's in ISO format without timezone, treat as UTC
      if (date.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)) {
        return new Date(date + 'Z');
      }
      // Try parsing as is
      return new Date(date);
    }

    return new Date(NaN); // Invalid date
  }

  private calculateTimeSince(date: Date, granularity?: 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second'): string {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 0) return "0"; // Future date

    // Calculate all time units
    const years = Math.floor(diffInSeconds / (60 * 60 * 24 * 365));
    const months = Math.floor(diffInSeconds / (60 * 60 * 24 * 30)) % 12;
    const days = Math.floor(diffInSeconds / (60 * 60 * 24)) % 30;
    const hours = Math.floor(diffInSeconds / (60 * 60)) % 24;
    const minutes = Math.floor(diffInSeconds / 60) % 60;
    const seconds = diffInSeconds % 60;

    // Build the result string
    const parts: string[] = [];

    if (years > 0) parts.push(`${years}y`);
    if (granularity === 'year') return parts.join(' ') || '0y';

    if (months > 0) parts.push(`${months}m`);
    if (granularity === 'month') return parts.join(' ') || '0m';

    if (days > 0) parts.push(`${days}d`);
    if (granularity === 'day') return parts.join(' ') || '0d';

    if (hours > 0) parts.push(`${hours}h`);
    if (granularity === 'hour') return parts.join(' ') || '0h';

    if (minutes > 0) parts.push(`${minutes}m`);
    if (granularity === 'minute') return parts.join(' ') || '0m';

    if (seconds > 0) parts.push(`${seconds}s`);

    return parts.join(' ') || '0s';
  }
}
