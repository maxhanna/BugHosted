import { Component, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { UserService } from '../../services/user.service';
import { User } from '../../services/datacontracts/user/user';
import { UserListComponent } from '../user-list/user-list.component';

@Component({
  selector: 'app-moderator',
  standalone: false,
  templateUrl: './moderator.component.html',
  styleUrl: './moderator.component.css'
})
export class ModeratorComponent extends ChildComponent {
  @ViewChild('userList') userList!: UserListComponent;

  appeals: any[] = [];
  loading = false;
  isModerator = false;
  moderators: User[] = [];
  selectedUsers: User[] = [];
  showUserList = false;
  modActionLoading = false;

  constructor(private userService: UserService) { super(); }

  async ngOnInit() {
    const user = this.parentRef?.user;
    this.isModerator = user?.id === 1 || user?.role === 'moderator';
    if (this.isModerator) {
      await this.loadModerators();
      await this.loadAppeals();
    }
  }

  async loadModerators() {
    const userId = this.parentRef?.user?.id;
    if (!userId) return;
    this.moderators = await this.userService.getModerators(userId);
    if (!this.moderators.some(m => m.id === 1)) {
      this.moderators.unshift(new User(1, 'Admin #1', undefined));
    }
  }

  async loadAppeals() {
    const userId = this.parentRef?.user?.id;
    if (!userId) return;
    this.loading = true;
    this.appeals = await this.userService.getAppeals(userId);
    this.loading = false;
  }

  async approveAppeal(appealId: number) {
    const userId = this.parentRef?.user?.id;
    if (!userId) return;
    await this.userService.resolveAppeal(appealId, userId, 'approved');
    await this.loadAppeals();
  }

  async denyAppeal(appealId: number) {
    const userId = this.parentRef?.user?.id;
    if (!userId) return;
    await this.userService.resolveAppeal(appealId, userId, 'denied');
    await this.loadAppeals();
  }

  onUsersSelected(users: User[]) {
    this.selectedUsers = users;
  }

  async addModerators() {
    const userId = this.parentRef?.user?.id;
    if (!userId || this.selectedUsers.length === 0) return;
    this.modActionLoading = true;
    for (const u of this.selectedUsers) {
      if (u.id) await this.userService.setRole(u.id, 'moderator', userId);
    }
    this.selectedUsers = [];
    this.showUserList = false;
    await this.loadModerators();
    this.modActionLoading = false;
  }

  async removeModerator(targetUser: User) {
    const userId = this.parentRef?.user?.id;
    if (!userId || !targetUser.id || targetUser.id === 1) return;
    this.modActionLoading = true;
    await this.userService.setRole(targetUser.id, 'moderator', userId, true);
    await this.loadModerators();
    this.modActionLoading = false;
  }

  toggleUserList() {
    this.showUserList = !this.showUserList;
    if (!this.showUserList) {
      this.selectedUsers = [];
    }
  }
}
