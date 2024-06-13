import { Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { UserService } from '../../services/user.service';
import { User } from '../../services/datacontracts/user';
import { ChatNotification } from '../../services/datacontracts/chat-notification';

@Component({
  selector: 'app-user-list',
  templateUrl: './user-list.component.html',
  styleUrl: './user-list.component.css'
})
export class UserListComponent implements OnInit {
  @Input() user?: User;
  @Input() chatNotifications?: ChatNotification[];
  @Output() userClickEvent = new EventEmitter<User>();

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  users: Array<User> = [];
  constructor(private userService: UserService) {

  }
  async ngOnInit() {
    this.users = await this.userService.getAllUsers(this.user!);
  }
  click(value: User) {
    this.userClickEvent.emit(value);
  }
  getChatNotificationsByUser(userId?: number) {
    if (userId) {
      if (this.chatNotifications && this.chatNotifications.filter(x => x.senderId == userId)[0]) {
        return this.chatNotifications?.filter(x => x.senderId == userId)[0].count;
      }
    }
    return '';
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
