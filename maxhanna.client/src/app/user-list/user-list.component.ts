import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
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
}
