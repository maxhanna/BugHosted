import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnInit, Output, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { User } from '../../services/datacontracts/user/user';
import { UserService } from '../../services/user.service';
import { AppComponent } from '../app.component';

@Component({
  selector: 'app-new-users',
  templateUrl: './new-users.component.html',
  styleUrls: ['./new-users.component.css'],
  standalone: false
})
export class NewUsersComponent extends ChildComponent implements OnInit, AfterViewInit { 
  users: Array<User> = []; 
  loadError: string | null = null;
  @Input() inputtedParentRef?: AppComponent; 

  constructor(private userService: UserService) { super(); }

  async ngOnInit() {
    await this.loadTodayUsers();
  }
  ngAfterViewInit() {}

  async loadTodayUsers() {
    // Fetch users created today from server endpoint
    this.loadError = null;
    this.startLoading();
    try {
      this.users = await this.userService.getNewUsersToday();
    } catch (e) {
      console.error('Failed to load new users today', e);
      this.users = [];
      this.loadError = 'Failed to load new users.';
    } finally {
      this.stopLoading();
    }
  }

  createUserProfileComponent(user?: User) {
    if (!user) { return alert("you must select a user!"); }
    setTimeout(() => { this.inputtedParentRef?.createComponent("User", { "user": user }); }, 1);
  }
}
