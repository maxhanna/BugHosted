import { Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { UserService } from '../../services/user.service';
import { ChatNotification } from '../../services/datacontracts/chat/chat-notification';
import { ChatService } from '../../services/chat.service';
import { ChildComponent } from '../child.component';
import { User } from '../../services/datacontracts/user/user';
import { AppComponent } from '../app.component';
import { FriendService } from '../../services/friend.service';

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
  @Input() displayOnlyFriends: boolean = false;
  @Input() displayRadioFilters: boolean = false;
  @Input() contactsOnly: boolean = false;
  @Output() userClickEvent = new EventEmitter<User | undefined>();
  @Output() userSelectClickEvent = new EventEmitter<User[] | undefined>();

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;
  @ViewChild('allUsersRadio') allUsersRadio!: ElementRef<HTMLInputElement>;
  @ViewChild('friendsRadio') friendsRadio!: ElementRef<HTMLInputElement>;

  private chatInfoInterval: any;
  users: Array<User> = [];
  selectedUsers: Array<User> = [];
  filterOption: string = 'all';
  friendSelected = false;

  constructor(private userService: UserService, private chatService: ChatService, private friendService: FriendService) {
    super();
  }
  async ngOnInit() {
    this.getChatInfo();
    this.chatInfoInterval = setInterval(() => this.getChatInfo(), 30 * 1000);
    this.getUsers();
    await this.sortUsersByNotifications();
  }
  async ngOnDestroy() {
    clearInterval(this.chatInfoInterval);
  }

  async getUsers() {
    if (!this.user) {
      this.users = await this.userService.getAllUsers(new User(0, "Anonymous")); 
    } else {
      let search = undefined;
      if (this.searchInput && this.searchInput.nativeElement.value && this.searchInput.nativeElement.value.trim() != '') {
        search = this.searchInput.nativeElement.value;
      }
      if (!search && (this.friendsRadio ? this.friendsRadio.nativeElement.checked : this.displayOnlyFriends)) {
        this.users = await this.friendService.getFriends(this.user!);
      } else {
        this.users = await this.userService.getAllUsers(this.user!, search);
      }
    } 
  }
  click(value?: User) {
    this.userClickEvent.emit(value);
    if (this.inputtedParentRef && this.inputtedParentRef.showOverlay) {
      this.inputtedParentRef.closeOverlay();
    } 
  }
  getChatNotificationsByUser(userId?: number) {
    if (userId && this.chatNotifications && this.chatNotifications.length > 0) {
      const tmpChatNotif = this.chatNotifications.find(x => x.senderId == userId);
      if (this.chatNotifications && tmpChatNotif) {
        return tmpChatNotif.count;
      }
    }
    return '';
  }

  async getChatInfo() {
    if (this.user) { 
      this.chatNotifications = await this.chatService.getChatNotificationsByUser(this.user);
    }
  }
  private async sortUsersByNotifications() {
    if (this.chatNotifications && this.chatNotifications.length > 0) { 
      const userNotificationCount = this.chatNotifications!.reduce((acc: { [key: number]: number }, notification) => {
        acc[notification.senderId] = (acc[notification.senderId] || 0) + 1;
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
  async search() {
    this.getUsers();
  } 
  async filterUsers() {
    this.getUsers();
  }
  selectFriend(user: User) {
    if (this.selectedUsers.some(x => x.id == user.id)) {
      this.selectedUsers = this.selectedUsers.filter(x => x.id != user.id);
    } else {
      this.selectedUsers.push(user);
    }
    this.userSelectClickEvent.emit(this.selectedUsers);
  } 
}
