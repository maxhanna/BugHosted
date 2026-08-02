import { Component, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { UserService } from '../../services/user.service';
import { ModeratorService } from '../../services/moderator.service';
import { User } from '../../services/datacontracts/user/user';
import { ModeratorInfo, ModeratorLog, ModeratorRole, RoleDefinition } from '../../services/datacontracts/moderator/moderator';
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
  moderators: ModeratorInfo[] = [];
  roleCatalog: RoleDefinition[] = [];
  selectedUsers: User[] = [];
  showUserList = false;
  modActionLoading = false;
  expandedUserIds: number[] = [];

  // Add-role flow
  addRoleTargetUserId = 0;
  selectedRole = '';
  selectedTargetType = 'global';
  selectedTargetId = 0;
  chatTargets: { id: number; name: string }[] = [];
  topicTargets: { id: number; name: string }[] = [];

  // Logs
  modLogs: ModeratorLog[] = [];
  showLogs = true;
  logsLoading = false;

  constructor(
    private userService: UserService,
    private moderatorService: ModeratorService) { super(); }

  async ngOnInit() {
    const user = this.parentRef?.user;
    this.isModerator = user?.id === 1 || user?.role === 'moderator';
    if (this.isModerator) {
      await Promise.all([
        this.loadModerators(),
        this.loadRoleCatalog(),
        this.loadModeratorLogs(),
        this.loadAppeals()
      ]);
    }
  }

  async loadModerators() {
    const userId = this.parentRef?.user?.id;
    if (!userId) return;
    const sessionToken = await this.parentRef?.getSessionToken() ?? '';
    this.moderators = await this.moderatorService.getModeratorsWithRoles(userId, sessionToken);
  }

  async loadRoleCatalog() {
    const userId = this.parentRef?.user?.id;
    if (!userId) return;
    const sessionToken = await this.parentRef?.getSessionToken() ?? '';
    this.roleCatalog = await this.moderatorService.getRoleCatalog(userId, sessionToken);
    if (this.roleCatalog.length > 0) {
      this.selectedRole = this.roleCatalog[0].role;
      this.selectedTargetType = this.roleCatalog[0].targetType ?? 'global';
      await this.loadTargets();
    }
  }

  async loadTargets() {
    const userId = this.parentRef?.user?.id;
    if (!userId) return;
    const sessionToken = await this.parentRef?.getSessionToken() ?? '';
    if (this.selectedTargetType === 'chat') {
      try {
        if (this.chatTargets.length === 0) {
          // Load group chats via the chat service endpoint
          const response = await fetch('/chat/getgroupchats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userId),
          });
          const groupChats: any[] = await response.json() ?? [];
          this.chatTargets = groupChats.map((c, i) => ({
            id: c.chatId ?? i,
            name: (c.receiver ?? []).map((r: any) => r?.username).filter(Boolean).join(', ')
          }));
        }
      } catch (e) {
        this.chatTargets = [];
      }
    } else if (this.selectedTargetType === 'topic') {
      try {
        const response = await fetch('/topic/gettopics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ UserId: userId }),
        });
        const topics: any[] = await response.json() ?? [];
        this.topicTargets = topics.map(t => ({ id: t.id, name: t.topicText ?? t.topic ?? 'Topic ' + t.id }));
      } catch (e) {
        this.topicTargets = [];
      }
    }
  }

  onRoleSelectionChange() {
    const def = this.roleCatalog.find(r => r.role === this.selectedRole);
    this.selectedTargetType = def?.targetType ?? 'global';
    this.selectedTargetId = 0;
    this.loadTargets();
  }

  async loadAppeals() {
    const userId = this.parentRef?.user?.id;
    if (!userId) return;
    const sessionToken = await this.parentRef?.getSessionToken() ?? '';
    this.loading = true;
    this.appeals = await this.userService.getAppeals(userId, sessionToken);
    this.loading = false;
  }

  async loadModeratorLogs() {
    const userId = this.parentRef?.user?.id;
    if (!userId) return;
    const sessionToken = await this.parentRef?.getSessionToken() ?? '';
    this.logsLoading = true;
    this.modLogs = await this.moderatorService.getModeratorLogs(userId, sessionToken, 200);
    this.logsLoading = false;
  }

  async approveAppeal(appealId: number) {
    const userId = this.parentRef?.user?.id;
    if (!userId) return;
    const sessionToken = await this.parentRef?.getSessionToken() ?? '';
    await this.userService.resolveAppeal(appealId, userId, 'approved', sessionToken);
    await this.loadAppeals();
  }

  async denyAppeal(appealId: number) {
    const userId = this.parentRef?.user?.id;
    if (!userId) return;
    const sessionToken = await this.parentRef?.getSessionToken() ?? '';
    await this.userService.resolveAppeal(appealId, userId, 'denied', sessionToken);
    await this.loadAppeals();
  }

  onUsersSelected(users?: User[]) {
    if (!users) return;
    this.selectedUsers = users;
  }

  toggleExpand(userId: number) {
    if (this.expandedUserIds.includes(userId)) {
      this.expandedUserIds = this.expandedUserIds.filter(x => x !== userId);
    } else {
      this.expandedUserIds.push(userId);
    }
  }

  isExpanded(userId: number): boolean {
    return this.expandedUserIds.includes(userId);
  }

  roleChips(info: ModeratorInfo): string {
    if (!info.roles || info.roles.length === 0) return 'No roles';
    return info.roles.map(r => {
      let label = r.role.replace(/_/g, ' ');
      if (r.targetName) label += ` (${r.targetName})`;
      return label;
    }).join(', ');
  }

  formatRole(r: ModeratorRole): string {
    let label = r.role.replace(/_/g, ' ');
    if (r.targetName) label += ` — ${r.targetName}`;
    else if (r.targetType && r.targetType !== 'global') label += ` (${r.targetType} #${r.targetId ?? ''})`;
    return label;
  }

  async addModerators() {
    const userId = this.parentRef?.user?.id;
    if (!userId || this.selectedUsers.length === 0) return;
    const sessionToken = await this.parentRef?.getSessionToken() ?? '';
    this.modActionLoading = true;
    for (const u of this.selectedUsers) {
      if (u.id) {
        await this.moderatorService.setRole(u.id, this.selectedRole, userId, false, sessionToken, this.selectedTargetType, this.selectedTargetId || undefined);
      }
    }
    this.selectedUsers = [];
    this.showUserList = false;
    await Promise.all([this.loadModerators(), this.loadModeratorLogs()]);
    this.modActionLoading = false;
  }

  async removeRole(targetUser: User, role: ModeratorRole) {
    const userId = this.parentRef?.user?.id;
    if (!userId || !targetUser.id || targetUser.id === 1) return;
    const sessionToken = await this.parentRef?.getSessionToken() ?? '';
    this.modActionLoading = true;
    await this.moderatorService.setRole(targetUser.id, role.role, userId, true, sessionToken, role.targetType, role.targetId ?? undefined);
    await Promise.all([this.loadModerators(), this.loadModeratorLogs()]);
    this.modActionLoading = false;
  }

  async removeModerator(targetUser: User) {
    const userId = this.parentRef?.user?.id;
    if (!userId || !targetUser.id || targetUser.id === 1) return;
    const sessionToken = await this.parentRef?.getSessionToken() ?? '';
    this.modActionLoading = true;
    await this.moderatorService.setRole(targetUser.id, 'moderator', userId, true, sessionToken, 'global');
    await Promise.all([this.loadModerators(), this.loadModeratorLogs()]);
    this.modActionLoading = false;
  }

  toggleUserList() {
    this.showUserList = !this.showUserList;
    if (!this.showUserList) {
      this.selectedUsers = [];
    }
  }
}
