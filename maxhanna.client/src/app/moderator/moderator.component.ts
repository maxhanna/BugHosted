import { Component } from '@angular/core';
import { ChildComponent } from '../child.component';
import { UserService } from '../../services/user.service';
import { ModeratorService } from '../../services/moderator.service';
import { User } from '../../services/datacontracts/user/user';
import { ModeratorInfo, ModeratorLog, ModeratorRole, RoleDefinition } from '../../services/datacontracts/moderator/moderator';

@Component({
  selector: 'app-moderator',
  standalone: false,
  templateUrl: './moderator.component.html',
  styleUrl: './moderator.component.css'
})
export class ModeratorComponent extends ChildComponent {
  activeTab: 'moderators' | 'logs' | 'appeals' = 'moderators';

  appeals: any[] = [];
  loading = false;
  isModerator = false;
  moderators: ModeratorInfo[] = [];
  roleCatalog: RoleDefinition[] = [];

  // Add-role flow (purpose-built user search — no chat-oriented user-list noise)
  userSearchTerm = '';
  searchResults: User[] = [];
  searchingUsers = false;
  searchDone = false;
  selectedUsers: User[] = [];
  selectedRole = '';
  selectedTargetType = 'global';
  selectedTargetId = 0;
  chatTargets: { id: number; name: string }[] = [];
  topicTargets: { id: number; name: string }[] = [];
  modActionLoading = false;
  modMessage = '';
  modMessageIsError = false;
  private searchDebounce: any;

  expandedUserIds: number[] = [];

  // Logs
  modLogs: ModeratorLog[] = [];
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

  setTab(tab: 'moderators' | 'logs' | 'appeals') {
    this.activeTab = tab;
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
    if (this.selectedTargetType === 'chat') {
      try {
        if (this.chatTargets.length === 0) {
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

  // ─── Purpose-built user search ───
  onSearchInput() {
    clearTimeout(this.searchDebounce);
    this.searchDone = false;
    const term = (this.userSearchTerm || '').trim();
    if (!term) {
      this.searchResults = [];
      this.searchingUsers = false;
      return;
    }
    this.searchingUsers = true;
    this.searchDebounce = setTimeout(() => this.searchUsers(), 300);
  }

  async searchUsers() {
    const userId = this.parentRef?.user?.id;
    const term = (this.userSearchTerm || '').trim();
    if (!userId || !term) {
      this.searchResults = [];
      this.searchingUsers = false;
      return;
    }
    try {
      const found = (await this.userService.getAllUsers(userId, term)) ?? [];
      this.searchResults = found.filter(u => u.id && !this.selectedUsers.some(s => s.id === u.id));
    } catch (e) {
      this.searchResults = [];
    }
    this.searchingUsers = false;
    this.searchDone = true;
  }

  addUserToSelection(u: User) {
    if (!u || !u.id || this.selectedUsers.some(s => s.id === u.id)) return;
    this.selectedUsers.push(u);
    this.searchResults = this.searchResults.filter(r => r.id !== u.id);
    // If that was the last result, don't show a misleading "no users found" state.
    if (this.searchResults.length === 0) this.searchDone = false;
    this.modMessage = '';
  }

  removeUserFromSelection(u: User) {
    this.selectedUsers = this.selectedUsers.filter(s => s.id !== u.id);
  }

  clearSelection() {
    this.selectedUsers = [];
    this.searchDone = false;
    this.searchResults = [];
    this.userSearchTerm = '';
    this.modMessage = '';
  }

  isAlreadyModerator(u: User): boolean {
    return this.moderators.some(m => m.user?.id === u.id);
  }

  canAssign(): boolean {
    if (this.selectedUsers.length === 0 || !this.selectedRole) return false;
    if (this.selectedTargetType === 'chat' && !this.selectedTargetId) return false;
    if (this.selectedTargetType === 'topic' && !this.selectedTargetId) return false;
    return true;
  }

  async addModerators() {
    const userId = this.parentRef?.user?.id;
    if (!userId || this.selectedUsers.length === 0 || !this.canAssign()) return;
    const sessionToken = this.parentRef ? await this.parentRef.getSessionToken() ?? '' : '';
    this.modActionLoading = true;
    this.modMessage = '';
    let failures = 0;
    for (const u of this.selectedUsers) {
      if (u.id) {
        const ok = await this.moderatorService.setRole(u.id, this.selectedRole, userId, false, sessionToken, this.selectedTargetType, this.selectedTargetId || undefined);
        if (!ok) failures++;
      }
    }
    this.modActionLoading = false;
    if (failures === 0) {
      this.modMessage = `✅ Assigned '${this.roleLabel(this.selectedRole)}' to ${this.selectedUsers.length} user(s).`;
      this.modMessageIsError = false;
      this.clearSelection();
      await Promise.all([this.loadModerators(), this.loadModeratorLogs()]);
    } else {
      this.modMessage = `❌ ${failures} assignment(s) failed. Please try again.`;
      this.modMessageIsError = true;
    }
  }

  roleLabel(role: string): string {
    const def = this.roleCatalog.find(r => r.role === role);
    return def?.label ?? role.replace(/_/g, ' ');
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

  formatRole(r: ModeratorRole): string {
    let label = r.role.replace(/_/g, ' ');
    if (r.targetName) label += ` — ${r.targetName}`;
    else if (r.targetType && r.targetType !== 'global') label += ` (${r.targetType} #${r.targetId ?? ''})`;
    return label;
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
}
