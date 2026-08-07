import { Component } from '@angular/core';
import { ChildComponent } from '../child.component';
import { UserService } from '../../services/user.service';
import { ModeratorService } from '../../services/moderator.service';
import { User } from '../../services/datacontracts/user/user';
import { ChatBan, ChatBanAppeal, ModeratorInfo, ModeratorLog, ModeratorRequest, ModeratorRole, RoleDefinition } from '../../services/datacontracts/moderator/moderator';
import { Topic } from '../../services/datacontracts/topics/topic';

@Component({
  selector: 'app-moderator',
  standalone: false,
  templateUrl: './moderator.component.html',
  styleUrl: './moderator.component.css'
})
export class ModeratorComponent extends ChildComponent {
  activeTab: 'myappeals' | 'moderators' | 'chatmod' | 'logs' | 'appeals' = 'myappeals';

  appeals: any[] = [];
  modRequests: ModeratorRequest[] = [];
  // Any user's own moderator requests (chat + topic, pending + resolved)
  myRequests: any[] = [];
  myRequestsLoading = false;
  loading = false;
  isModerator = false;
  // Admin is a moderator role with extra privileges — only admins can add
  // moderators or manage appeals (server-enforced, mirrored here for the UI).
  isAdmin = false;
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
  selectedAttachedTopics: Topic[] = [];
  modActionLoading = false;
  modMessage = '';
  modMessageIsError = false;
  private searchDebounce: any;

  // Per-moderator add-role flow (inline picker inside an expanded moderator row)
  addRoleForUserId = 0; // moderator row currently showing the add-role picker (0 = none)
  rowRole = '';
  rowTargetType = 'global';
  rowTargetId = 0;
  rowActionLoading = false;
  rowMessage = '';
  rowMessageIsError = false;
  rowAttachedTopics: Topic[] = [];

  expandedUserIds: number[] = [];

  // Chat-scoped moderation (low-level chat room moderators)
  isChatModerator = false;
  myChatRoles: ModeratorRole[] = [];
  selectedManagedChat = 0;
  managedChatMods: ModeratorInfo[] = [];
  chatBans: ChatBan[] = [];
  chatAppeals: ChatBanAppeal[] = [];
  chatModRequests: ModeratorRequest[] = [];
  chatModLoading = false;
  chatModMessage = '';
  chatModMessageIsError = false;
  // Chat-mod user search (add mods / ban)
  chatModSearchTerm = '';
  chatModSearchResults: User[] = [];
  chatModSearching = false;
  chatModSearchDone = false;
  selectedChatBanUser: User | null = null;
  banReason = '';
  chatModActionLoading = false;
  private chatModSearchDebounce: any;

  // Logs
  modLogs: ModeratorLog[] = [];
  logsLoading = false;

  constructor(
    private userService: UserService,
    private moderatorService: ModeratorService) { super(); }

  async ngOnInit() {
    const user = this.parentRef?.user;
    const isLegacyMod = user?.id === 1 || user?.role === 'moderator' || user?.role === 'admin';
    this.isAdmin = user?.id === 1 || user?.role === 'admin';
    let myRoles: ModeratorRole[] = [];
    if (user?.id) {
      const sessionToken = await this.parentRef?.getSessionToken() ?? '';
      myRoles = await this.moderatorService.getMyRoles(user.id, sessionToken);
      // Admin is the source of truth for the scoped-roles table (covers freshly-granted admins).
      if (!this.isAdmin) this.isAdmin = myRoles.some(r => r.role === 'admin');
      // Low-level chat moderation: chat_moderator for a specific room grants
      // access to this panel, scoped to the chats they moderate.
      this.isChatModerator = myRoles.some(r => r.role === 'chat_moderator' && r.targetType === 'chat' && !!r.targetId);
      this.myChatRoles = myRoles.filter(r => r.role === 'chat_moderator' && r.targetType === 'chat' && !!r.targetId);
    }
    this.isModerator = isLegacyMod || this.isChatModerator;
    await this.loadMyRequests();
    if (this.isModerator) {
      this.activeTab = 'moderators';
      if (this.isChatModerator && this.myChatRoles.length > 0) {
        this.selectedManagedChat = this.myChatRoles[0].targetId ?? 0;
      }
      await Promise.all([
        this.loadModerators(),
        this.loadRoleCatalog(),
        this.loadModeratorLogs(),
        this.isAdmin ? this.loadAppeals() : Promise.resolve()
      ]);
      if (this.selectedManagedChat) {
        await this.loadChatModeration();
      }
    }
  }

  setTab(tab: 'myappeals' | 'moderators' | 'chatmod' | 'logs' | 'appeals') {
    this.activeTab = tab;
    if (tab !== 'moderators') {
      this.addRoleForUserId = 0;
    }
    if (tab === 'chatmod' && !this.selectedManagedChat) {
      this.selectedManagedChat = this.myChatRoles[0]?.targetId ?? 0;
    }
    if (tab === 'myappeals' && this.myRequests.length === 0) {
      this.loadMyRequests();
    }
  }

  /** Loads the caller's own moderator requests for the My Appeals view. */
  async loadMyRequests() {
    const userId = this.parentRef?.user?.id;
    if (!userId) return;
    const sessionToken = await this.parentRef?.getSessionToken() ?? '';
    this.myRequestsLoading = true;
    try {
      this.myRequests = await this.moderatorService.getMyModeratorRequests(userId, sessionToken);
    } catch (e) {
      this.myRequests = [];
    } finally {
      this.myRequestsLoading = false;
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
    await this.loadTargetsFor(this.selectedTargetType);
  }

  /** Load the chat target list (topics are picked via the app-topics dropdown). */
  private async loadTargetsFor(targetType: string) {
    const userId = this.parentRef?.user?.id;
    if (!userId) return;
    if (targetType === 'chat') {
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
    }
  }

  onRoleSelectionChange() {
    const def = this.roleCatalog.find(r => r.role === this.selectedRole);
    this.selectedTargetType = def?.targetType ?? 'global';
    this.selectedTargetId = 0;
    this.selectedAttachedTopics = [];
    this.loadTargets();
  }

  /** app-topics dropdown for the top add-role card — keep the newest topic as the target. */
  onSelectedTopicsChanged(topics: Topic[]) {
    this.selectedTargetId = this.topicTargetId(topics);
  }

  private topicTargetId(topics: Topic[]): number {
    return topics && topics.length ? topics[topics.length - 1].id : 0;
  }

  async loadAppeals() {
    const userId = this.parentRef?.user?.id;
    if (!userId) return;
    const sessionToken = await this.parentRef?.getSessionToken() ?? '';
    this.loading = true;
    const [appeals, modRequests] = await Promise.all([
      this.userService.getAppeals(userId, sessionToken),
      this.moderatorService.getModeratorRequests(userId, sessionToken),
    ]);
    this.appeals = appeals;
    this.modRequests = modRequests;
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

  async resolveModRequest(req: ModeratorRequest, resolution: 'approved' | 'denied') {
    const userId = this.parentRef?.user?.id;
    if (!userId) return;
    const sessionToken = await this.parentRef?.getSessionToken() ?? '';
    this.loading = true;
    await this.moderatorService.resolveModeratorRequest(req.id, userId, resolution, sessionToken);
    this.loading = false;
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
    // Mirror of the server-side lockout protection — can't remove your own
    // admin role, and the last admin can't be demoted.
    if (this.isProtectedAdminRemoval(targetUser, role)) return;
    const sessionToken = await this.parentRef?.getSessionToken() ?? '';
    this.modActionLoading = true;
    await this.moderatorService.setRole(targetUser.id, role.role, userId, true, sessionToken, role.targetType, role.targetId ?? undefined);
    await Promise.all([this.loadModerators(), this.loadModeratorLogs()]);
    this.modActionLoading = false;
  }

  /** True when removing this role would strip the target's own admin role or
   *  demote the last remaining admin — protected on the server too, so this
   *  just keeps the ✕ from being shown for impossible actions. */
  isProtectedAdminRemoval(targetUser: User, role: ModeratorRole): boolean {
    // Exact match on 'admin' — mirrors the server's OrdinalIgnoreCase check so
    // the client and server enforce the same rule (no substring surprises).
    if (!role || !role.role || role.role.toLowerCase() !== 'admin') return false;
    const t = (role.targetType ?? '').toLowerCase();
    if (t && t !== 'global') return false; // only the global admin role is protected
    const userId = this.parentRef?.user?.id;
    if (targetUser.id === userId) return true; // rule 1: can't remove your own admin role
    return this.isLastAdmin(targetUser); // rule 2: last admin can't be demoted
  }

  /** Whether this user is the only one holding a global admin role. */
  isLastAdmin(targetUser: User): boolean {
    const isAdminRole = (r: ModeratorRole) => r && r.role && r.role.toLowerCase() === 'admin' &&
      (!r.targetType || r.targetType.toLowerCase() === 'global');
    const targetHasAdmin = (this.moderators.find(m => m.user?.id === targetUser.id)?.roles ?? [])
      .some(r => isAdminRole(r));
    if (!targetHasAdmin) return false;
    const otherAdmins = this.moderators.filter(m => m.user?.id && m.user.id !== targetUser.id)
      .some(m => (m.roles ?? []).some(r => isAdminRole(r)));
    return !otherAdmins;
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

  // ─── Per-moderator add role (inline picker in the expanded moderator row) ───

  /** Toggle the inline add-role picker for a moderator row. */
  openAddRoleFor(userId: number) {
    if (this.addRoleForUserId === userId) {
      this.addRoleForUserId = 0;
      return;
    }
    this.addRoleForUserId = userId;
    this.rowRole = this.roleCatalog[0]?.role ?? '';
    this.rowTargetType = this.roleCatalog[0]?.targetType ?? 'global';
    this.rowTargetId = 0;
    this.rowMessage = '';
    this.rowAttachedTopics = [];
    this.loadRowTargets();
  }

  onRowRoleSelectionChange() {
    const def = this.roleCatalog.find(r => r.role === this.rowRole);
    this.rowTargetType = def?.targetType ?? 'global';
    this.rowTargetId = 0;
    this.rowAttachedTopics = [];
    this.loadRowTargets();
  }

  /** app-topics dropdown in the per-row picker — keep the newest topic as the target. */
  onRowTopicsChanged(topics: Topic[]) {
    this.rowTargetId = this.topicTargetId(topics);
  }

  canAssignRowRole(): boolean {
    if (!this.addRoleForUserId || !this.rowRole) return false;
    if (this.rowTargetType === 'chat' && !this.rowTargetId) return false;
    if (this.rowTargetType === 'topic' && !this.rowTargetId) return false;
    return true;
  }

  async addRoleToModerator(targetUser: User) {
    const userId = this.parentRef?.user?.id;
    if (!userId || !targetUser.id || !this.canAssignRowRole()) return;
    const sessionToken = await this.parentRef?.getSessionToken() ?? '';
    this.rowActionLoading = true;
    this.rowMessage = '';
    const ok = await this.moderatorService.setRole(targetUser.id, this.rowRole, userId, false, sessionToken, this.rowTargetType, this.rowTargetId || undefined);
    this.rowActionLoading = false;
    if (ok) {
      this.rowMessage = `✅ Assigned '${this.roleLabel(this.rowRole)}' to ${targetUser.username ?? ('User #' + targetUser.id)}.`;
      this.rowMessageIsError = false;
      this.addRoleForUserId = 0;
      await Promise.all([this.loadModerators(), this.loadModeratorLogs()]);
    } else {
      this.rowMessage = '❌ Failed to assign the role. Please try again.';
      this.rowMessageIsError = true;
    }
  }

  /** Load the chat/topic target list for the inline row picker. */
  private loadRowTargets() {
    return this.loadTargetsFor(this.rowTargetType);
  }

  // ─── Chat-scoped moderation ────────────────────────────────────────────────

  /** All chat_moderator holders for the currently selected chat. */
  async loadChatModeration() {
    const userId = this.parentRef?.user?.id;
    if (!userId || !this.selectedManagedChat) return;
    const sessionToken = await this.parentRef?.getSessionToken() ?? '';
    this.chatModLoading = true;
    try {
      const [mods, bans, appeals, requests] = await Promise.all([
        this.moderatorService.getModeratorsWithRoles(userId, sessionToken),
        this.moderatorService.getChatBans(this.selectedManagedChat, userId, sessionToken),
        this.moderatorService.getChatBanAppeals(this.selectedManagedChat, userId, sessionToken),
        this.moderatorService.getModeratorRequests(userId, sessionToken, true),
      ]);
      this.moderators = mods;
      this.managedChatMods = mods.filter(m =>
        (m.roles ?? []).some(r => r.role === 'chat_moderator' && r.targetType === 'chat' && r.targetId === this.selectedManagedChat));
      this.chatBans = bans;
      this.chatAppeals = appeals;
      this.chatModRequests = (requests ?? []).filter(r => r.chatId === this.selectedManagedChat);
    } catch (e) {
      console.error('Error loading chat moderation:', e);
    }
    this.chatModLoading = false;
  }

  async resolveChatModRequest(req: ModeratorRequest, resolution: 'approved' | 'denied') {
    const userId = this.parentRef?.user?.id;
    if (!userId) return;
    const sessionToken = await this.parentRef?.getSessionToken() ?? '';
    this.chatModActionLoading = true;
    const res = await this.moderatorService.resolveModeratorRequest(req.id, userId, resolution, sessionToken);
    this.chatModActionLoading = false;
    if (res.ok) {
      this.chatModMessage = res.message;
      this.chatModMessageIsError = false;
      await this.loadChatModeration();
      if (this.isAdmin) await this.loadAppeals();
    } else {
      this.chatModMessage = res.message;
      this.chatModMessageIsError = true;
    }
  }

  onManagedChatChange() {
    this.selectedChatBanUser = null;
    this.banReason = '';
    this.chatModMessage = '';
    this.loadChatModeration();
  }

  managedChatName(): string {
    const role = this.myChatRoles.find(r => r.targetId === this.selectedManagedChat);
    return role?.targetName ?? `Chat #${this.selectedManagedChat}`;
  }

  // Chat-mod user search (add moderators / ban users)
  onChatModSearchInput() {
    clearTimeout(this.chatModSearchDebounce);
    this.chatModSearchDone = false;
    const term = (this.chatModSearchTerm || '').trim();
    if (!term) {
      this.chatModSearchResults = [];
      this.chatModSearching = false;
      return;
    }
    this.chatModSearching = true;
    this.chatModSearchDebounce = setTimeout(() => this.searchChatModUsers(), 300);
  }

  async searchChatModUsers() {
    const userId = this.parentRef?.user?.id;
    const term = (this.chatModSearchTerm || '').trim();
    if (!userId || !term) {
      this.chatModSearchResults = [];
      this.chatModSearching = false;
      return;
    }
    try {
      const found = (await this.userService.getAllUsers(userId, term)) ?? [];
      this.chatModSearchResults = found.filter(u => u.id && u.id !== this.selectedChatBanUser?.id);
    } catch (e) {
      this.chatModSearchResults = [];
    }
    this.chatModSearching = false;
    this.chatModSearchDone = true;
  }

  selectChatBanUser(u: User) {
    this.selectedChatBanUser = u;
    this.chatModSearchTerm = '';
    this.chatModSearchResults = [];
    this.chatModSearchDone = false;
    this.chatModMessage = '';
  }

  clearChatBanUser() {
    this.selectedChatBanUser = null;
    this.banReason = '';
  }

  /** Builds a proper User instance from a chat ban row for app-user-tag. */
  chatBanUser(b: ChatBan): User {
    return new User(b.userId, b.username || 'User #' + b.userId);
  }

  /** Builds a proper User instance from a chat appeal row for app-user-tag. */
  chatAppealUser(a: ChatBanAppeal): User {
    return new User(a.userId, a.username || 'User #' + a.userId);
  }

  modRequestUser(r: ModeratorRequest): User {
    return new User(r.userId, r.username || 'User #' + r.userId);
  }

  isChatMod(user: User): boolean {
    return (this.managedChatMods.some(m => m.user?.id === user.id));
  }

  /** Chat moderators can promote others to chat_moderator for their own room. */
  async addChatModerator(user: User) {
    const userId = this.parentRef?.user?.id;
    if (!userId || !user.id || !this.selectedManagedChat) return;
    const sessionToken = await this.parentRef?.getSessionToken() ?? '';
    this.chatModActionLoading = true;
    const ok = await this.moderatorService.setRole(user.id, 'chat_moderator', userId, false, sessionToken, 'chat', this.selectedManagedChat);
    this.chatModActionLoading = false;
    if (ok) {
      this.chatModMessage = `✅ ${user.username ?? 'User'} is now a moderator of ${this.managedChatName()}.`;
      this.chatModMessageIsError = false;
      this.chatModSearchResults = this.chatModSearchResults.filter(r => r.id !== user.id);
      this.chatModSearchDone = false;
      await Promise.all([this.loadChatModeration(), this.loadModeratorLogs()]);
    } else {
      this.chatModMessage = `❌ Couldn't promote ${user.username ?? 'User'}. Only this chat's moderators can add moderators here.`;
      this.chatModMessageIsError = true;
    }
  }

  async removeChatModerator(user: User) {
    const userId = this.parentRef?.user?.id;
    if (!userId || !user.id || !this.selectedManagedChat) return;
    if (user.id === this.parentRef?.user?.id) {
      this.chatModMessage = `You can't remove your own chat moderator role here.`;
      this.chatModMessageIsError = true;
      return;
    }
    const sessionToken = await this.parentRef?.getSessionToken() ?? '';
    this.chatModActionLoading = true;
    const ok = await this.moderatorService.setRole(user.id, 'chat_moderator', userId, true, sessionToken, 'chat', this.selectedManagedChat);
    this.chatModActionLoading = false;
    if (ok) {
      this.chatModMessage = `🗑️ ${user.username ?? 'User'} is no longer a moderator of ${this.managedChatName()}.`;
      this.chatModMessageIsError = false;
      await Promise.all([this.loadChatModeration(), this.loadModeratorLogs()]);
    } else {
      this.chatModMessage = `❌ Couldn't remove the role.`;
      this.chatModMessageIsError = true;
    }
  }

  async banChatModUser() {
    const userId = this.parentRef?.user?.id;
    if (!userId || !this.selectedChatBanUser?.id || !this.selectedManagedChat) return;
    const sessionToken = await this.parentRef?.getSessionToken() ?? '';
    this.chatModActionLoading = true;
    const ok = await this.moderatorService.banChatUser(this.selectedManagedChat, this.selectedChatBanUser.id, userId, this.banReason.trim(), sessionToken);
    this.chatModActionLoading = false;
    if (ok) {
      this.chatModMessage = `🚫 ${this.selectedChatBanUser.username ?? 'User'} was banned from ${this.managedChatName()}.`;
      this.chatModMessageIsError = false;
      this.clearChatBanUser();
      this.chatModSearchDone = false;
      this.chatModSearchResults = [];
      await Promise.all([this.loadChatModeration(), this.loadModeratorLogs()]);
    } else {
      this.chatModMessage = `❌ Couldn't ban that user.`;
      this.chatModMessageIsError = true;
    }
  }

  async unbanChatModUser(ban: ChatBan) {
    const userId = this.parentRef?.user?.id;
    if (!userId || !this.selectedManagedChat) return;
    const sessionToken = await this.parentRef?.getSessionToken() ?? '';
    this.chatModActionLoading = true;
    const ok = await this.moderatorService.unbanChatUser(this.selectedManagedChat, ban.userId, userId, sessionToken);
    this.chatModActionLoading = false;
    if (ok) {
      this.chatModMessage = `✅ ${ban.username ?? 'User'} was unbanned.`;
      this.chatModMessageIsError = false;
      await Promise.all([this.loadChatModeration(), this.loadModeratorLogs()]);
    } else {
      this.chatModMessage = `❌ Couldn't unban that user.`;
      this.chatModMessageIsError = true;
    }
  }

  async resolveChatAppeal(appeal: ChatBanAppeal, resolution: 'approved' | 'denied') {
    const userId = this.parentRef?.user?.id;
    if (!userId) return;
    const sessionToken = await this.parentRef?.getSessionToken() ?? '';
    this.chatModActionLoading = true;
    const ok = await this.moderatorService.resolveChatBanAppeal(appeal.id, userId, resolution, sessionToken);
    this.chatModActionLoading = false;
    if (ok) {
      this.chatModMessage = resolution === 'approved'
        ? `✅ Appeal approved — ${appeal.username ?? 'User'} was unbanned.`
        : `❌ Appeal denied.`;
      this.chatModMessageIsError = false;
      await Promise.all([this.loadChatModeration(), this.loadModeratorLogs()]);
    } else {
      this.chatModMessage = `❌ Couldn't resolve the appeal.`;
      this.chatModMessageIsError = true;
    }
  }
}
