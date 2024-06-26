import { Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { UserService } from '../../services/user.service';
import { User } from '../../services/datacontracts/user';
import { ChatNotification } from '../../services/datacontracts/chat-notification';
import { ChatService } from '../../services/chat.service';

@Component({
  selector: 'app-user-list',
  templateUrl: './user-list.component.html',
  styleUrl: './user-list.component.css'
})
export class UserListComponent implements OnInit, OnDestroy {
  @Input() user?: User;
  @Input() chatNotifications?: ChatNotification[];
  @Output() userClickEvent = new EventEmitter<User>();

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  private chatInfoInterval: any;
  users: Array<User> = [];
  constructor(private userService: UserService, private chatService: ChatService) {

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
  click(value: User) {
    this.userClickEvent.emit(value);
  }
  getChatNotificationsByUser(userId?: number) {
    if (userId) {
      if (this.chatNotifications && this.chatNotifications.filter(x => x.senderId == userId)[0]) {
        return this.chatNotifications?.filter(x => x.senderId == userId)[0].count ?? 0;
      }
    }
    return '';
  }

  async getChatInfo() {
    this.chatNotifications = await this.chatService.getChatNotificationsByUser(this.user!);
  }
  private async sortUsersByNotifications() {
    if (this.chatNotifications && this.chatNotifications.length > 0) {
      console.log("notifications more then 1");
      const userNotificationCount = this.chatNotifications!.reduce((acc: { [key: number]: number }, notification) => {
        acc[notification.senderId] = (acc[notification.senderId] || 0) + 1;
        return acc;
      }, {});
      console.log("userNotificationCount");
      console.log(userNotificationCount);
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

  debounce(func: Function, delay: number): (...args: any[]) => Promise<User[]> {
    let timeoutId: NodeJS.Timeout;
    return (...args: any[]) => {
      return new Promise(resolve => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(async () => {
          const result = await func.apply(this, args);
          resolve(result);
        }, delay);
      });
    };
  }
  async search() {
    try {
      const search = this.searchInput.nativeElement.value.trim();
      const debouncedSearch = this.debounce(this.userService.getAllUsers, 500);
      const res = await debouncedSearch(this.user, search);
      if (Array.isArray(res)) {
        this.users = res;
      }
    } catch { }
  }
}
