import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnInit, Output, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { User } from '../../services/datacontracts/user/user';
import { UserService } from '../../services/user.service';
import { AppComponent } from '../app.component';

@Component({
  selector: 'app-online-users',
  templateUrl: './online-users.component.html',
  styleUrl: './online-users.component.css',
  standalone: false
})
export class OnlineUsersComponent extends ChildComponent implements OnInit, AfterViewInit { 
  users: Array<User> = []; 
  loadError: string | null = null;
  @Input() inputtedParentRef?: AppComponent; 
  @Output() hasData = new EventEmitter<boolean>();
  loading = false;

  constructor(private userService: UserService) { super(); }

  async ngOnInit() {
    await this.loadTodayUsers();
  }
  ngAfterViewInit() {}

  async loadTodayUsers() {
    // Fetch users created today from server endpoint
    this.loadError = null;
    this.loading = true; 
    try {
      this.users = await this.userService.getOnlineUsers();
    } catch (e) {
      console.error('Failed to load new users today', e);
      this.users = [];
      this.loadError = 'Failed to load new users.';
    } finally {
      this.loading = false;
      try { this.hasData.emit((this.users?.length ?? 0) > 0); } catch {}
    }
  }

  createUserProfileComponent(user?: User) {
    if (!user) { return alert("you must select a user!"); }
    setTimeout(() => { this.inputtedParentRef?.createComponent("User", { "user": user }); }, 1);
  }
}
