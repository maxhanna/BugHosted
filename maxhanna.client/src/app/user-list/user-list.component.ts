import { Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { UserService } from '../../services/user.service';
import { ChatNotification } from '../../services/datacontracts/chat/chat-notification';
import { ChatService } from '../../services/chat.service';
import { ChildComponent } from '../child.component';
import { User } from '../../services/datacontracts/user/user';
import { AppComponent } from '../app.component';

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
  @Input() contactsOnly: boolean = false;
  @Output() userClickEvent = new EventEmitter<User | undefined>();

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  private chatInfoInterval: any;
  users: Array<User> = [];
  constructor(private userService: UserService, private chatService: ChatService) {
    super();
  }
  async ngOnInit() {
    this.getChatInfo();
    this.chatInfoInterval = setInterval(() => this.getChatInfo(), 30 * 1000); // every 30 seconds 
    this.users = await this.userService.getAllUsers(this.user!);
    await this.sortUsersByNotifications();
  }
  async ngOnDestroy() {
    clearInterval(this.chatInfoInterval);
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
    try {
      const search = this.searchInput.nativeElement.value.trim();
      if (this.user) {
        const res = await this.userService.getAllUsers(this.user!, search);
        if (res) {
          this.users = res;
        }
      }
    } catch { }
  }
}
