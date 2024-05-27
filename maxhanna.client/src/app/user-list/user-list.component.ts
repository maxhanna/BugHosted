import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { UserService } from '../../services/user.service';
import { User } from '../../services/datacontracts/user';

@Component({
  selector: 'app-user-list',
  templateUrl: './user-list.component.html',
  styleUrl: './user-list.component.css'
})
export class UserListComponent implements OnInit {
  @Input() user?: User;
  @Output() shareEvent = new EventEmitter<User>();

  users: Array<User> = [];
  constructor(private userService: UserService) { 

  }
  async ngOnInit() {
    this.users = await this.userService.getAllUsers(this.user!); 
  }
  share(value: User) {
    this.shareEvent.emit(value);
  }
}
