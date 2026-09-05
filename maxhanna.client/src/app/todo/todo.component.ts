import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { Todo } from '../../services/datacontracts/todo';
import { TodoService } from '../../services/todo.service';
import { MediaSelectorComponent } from '../media-selector/media-selector.component';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { User } from '../../services/datacontracts/user/user';
import { UserEventService } from '../../services/user-event.service';

@Component({
  selector: 'app-todo',
  templateUrl: './todo.component.html',
  styleUrl: './todo.component.css',
  standalone: false,
})
export class TodoComponent extends ChildComponent implements OnInit, AfterViewInit, OnDestroy {
  todos: Array<Todo> = [];
  sharedColumns: any[] = [];
  // Map ownerColumnId -> activations list
  columnActivations: { [ownerColumnId: number]: Array<{ userId: number, username?: string, activated?: boolean }> } = {};
  // currently managing ownerColumnId
  managingColumnId?: number = undefined;
  todoTypes: string[] = ['Todo', 'Work', 'Shopping', 'Study', 'Movie', 'Bucket', 'Recipe'];
  defaultTodoTypes: string[] = ['Todo', 'Work', 'Shopping', 'Study', 'Movie', 'Bucket', 'Recipe'];
  todoCount = 0;
  isEditListPanelOpen = false;
  isShareListPanelOpen = false;
  userColumns: string[] = [];
  isEditing: Todo[] = [];
  todoPlaceholder = "";
  selectedFile?: FileEntry;
  showSharedList = false;
  isExpandedEditFile = false;
  hasEditedTodo = false;
  isMenuPanelOpen = false;
  // Compact add bar: the url/speech/file controls live in a popup that opens
  // when the add-todo input is clicked, to keep the page footprint small.
  isAddTodoPopupOpen = false;
  // Polling for shared columns updates
  private sharedPollIntervalMs =15000; //15s
  private sharedPollTimer: any = null;
  // Remember whether shared polling was active before opening an edit session
  private wasSharedPollingActiveBeforeEdit: boolean = false;
  // Countdown (in seconds) until next shared list resynchronisation
  resyncCountdown: number = 0;
  private resyncTickTimer: any = null;
  isRenaming: string[] = [];

  // Pending share invites
  pendingShareInvites: Array<{ inviteId: number, fromUserId: number, fromUsername: string, columnName: string, todoColumnId: number }> = [];
  showShareInvitePrompt: boolean = false;

  @ViewChild('todoInput') todoInput!: ElementRef<HTMLInputElement>;
  @ViewChild('urlInput') urlInput!: ElementRef<HTMLInputElement>;
  @ViewChild('selectedType') selectedType!: ElementRef<HTMLSelectElement>;
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;
  @ViewChild('mediaSelector') mediaSelector!: MediaSelectorComponent;
  @ViewChild('todoEditingFile') todoEditingFile!: MediaSelectorComponent;
  @ViewChild('addNewColumnInput') addNewColumnInput!: ElementRef<HTMLInputElement>;

  constructor(
    private todoService: TodoService,
    private userEventService: UserEventService
  ) {
    super();
  }

  async ngOnInit() {
    this.startLoading();
    await this.getTodoInfo();
    if (this.parentRef?.user?.id) {
      await this.todoService.getColumnsForUser(this.parentRef.user.id).then(res => {
        if (res) {
          this.userColumns = res;

          // Filter userColumns to get only columns where is_added is true
          const userColumnNames = this.userColumns
            .filter((col: any) => col.is_added === true) // Only include columns where is_added is true
            .map((col: any) => col.column_name); // Extract column names

          // Update todoTypes based on user columns
          this.todoTypes = userColumnNames;
        }
      });

      await this.todoService.getSharedColumns(this.parentRef.user.id).then(res => {
        if (res) {
          // Normalize server response keys (handle PascalCase from server or camelCase)
          this.sharedColumns = (res as any[]).map((r: any) => ({
            ownerId: r.ownerId ?? r.OwnerId,
            columnName: r.columnName ?? r.ColumnName,
            sharedWith: r.sharedWith ?? r.SharedWith ?? '',
            ownerName: r.ownerName ?? r.OwnerName ?? '',
            shareDirection: r.shareDirection ?? r.ShareDirection ?? '',
            ownerColumnId: r.ownerColumnId ?? r.OwnerColumnId ?? r.OwnerColumnId
          }));
        }
      });
    } 

    if (this.parentRef?.user?.id) {
      await this.loadPendingShareInvites();
    }

    this.stopLoading();
  }
  rename(type: string) {
    if (this.isRenaming.includes(type)) {
      this.isRenaming = this.isRenaming.filter(x => x != type);
    } else { 
      this.isRenaming.push(type);
    }
  }
  cancelRename(type: string) {
    this.isRenaming = this.isRenaming.filter(x => x != type);
  }

  // Textarea input: flag the edit and auto-grow the box with its content.
  onTodoTextInput(e: Event) {
    this.hasEditedTodo = true;
    this.autoGrowTextarea(e.target as HTMLTextAreaElement | null);
  }

  onTodoEditKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' || !event.ctrlKey) return;
    event.preventDefault();
    event.stopPropagation();
    if (!this.isLoading && this.isEditing.length > 0) {
      void this.closeEditPopup(true);
    }
  }

  // Voice input supplement: append captured speech to the "add todo" text box.
  onVoiceInputForAdd(text?: string) {
    if (!text) return;
    const input = this.todoInput?.nativeElement;
    if (!input) return;
    input.value = this.appendVoiceText(input.value, text);
    input.focus();
  }

  // Voice input supplement: append captured speech to the editing textarea.
  onVoiceInputForEdit(text?: string) {
    if (!text) return;
    const ta = document.getElementById('todoEditingTextarea') as HTMLTextAreaElement | null;
    if (!ta) return;
    ta.value = this.appendVoiceText(ta.value, text);
    this.hasEditedTodo = true;
    this.autoGrowTextarea(ta);
  }

  // Copy the todo text currently in the edit popup to the clipboard.
  async copyEditedTodo() {
    try {
      const ta = document.getElementById('todoEditingTextarea') as HTMLTextAreaElement | null;
      const text = ta?.value ?? '';
      if (!text.trim()) {
        this.parentRef?.showNotification?.('Nothing to copy.');
        return;
      }
      await navigator.clipboard.writeText(text);
      this.parentRef?.showNotification?.('Todo text copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy todo text: ', err);
      alert('Failed to copy text. Please copy manually.');
    }
  }

  private appendVoiceText(existing: string, text: string): string {
    const separator = existing && !existing.endsWith(' ') ? ' ' : '';
    return existing + separator + text;
  }

  // Auto-grow the todo edit textarea up to a max height, so long todos never
  // need scrolling while typing. Still user-resizable via the drag knob.
  autoGrowTextarea(el: HTMLTextAreaElement | null) {
    if (!el) return;
    const MAX = 320;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, MAX) + 'px';
    el.style.overflowY = el.scrollHeight > MAX ? 'auto' : 'hidden';
  }
  // The Edit Lists panel only manages custom lists — the built-in defaults
  // (Todo, Work, Shopping, ...) can't be renamed or deleted, so they're left out.
  get customTodoTypes(): string[] {
    return this.todoTypes.filter(t => !this.defaultTodoTypes.includes(t));
  }
  renameColumn(oldColumnName: string, newName: string) {
    const clean = (newName ?? '').trim();
    // Close the rename row on submit; nothing to do for empty/unchanged names.
    this.isRenaming = this.isRenaming.filter(x => x !== oldColumnName);
    if (!clean || clean === oldColumnName) return;
    if (this.todoTypes.includes(clean)) {
      this.parentRef?.showNotification?.('A list with that name already exists');
      return;
    }
    this.todoService.renameColumn(oldColumnName, clean).then(res => {
      if (!res || !res.ok) {
        this.parentRef?.showNotification?.('Rename failed — try again');
        return;
      }
      // Apply the new name in place so the dropdown and the Edit Lists panel
      // don't show the stale name until a reload.
      this.todoTypes = this.todoTypes.map(t => t === oldColumnName ? clean : t);
      // Keep share metadata pointing at the renamed column.
      for (const sc of this.sharedColumns) {
        const colName = sc.columnName ?? sc.column_name ?? sc.ColumnName;
        if (colName === oldColumnName) sc.columnName = clean;
      }
      // If the renamed list is the one being viewed, point the select at the
      // new name and reload so the header and list update immediately.
      if (this.selectedType?.nativeElement && this.selectedType.nativeElement.value === oldColumnName) {
        this.selectedType.nativeElement.value = clean;
        this.setTodoDropdownPlaceholder();
        this.getTodoInfo();
      }
    });
  }

  private async loadPendingShareInvites() {
    if (!this.parentRef?.user?.id) return;
    try {
      const invites = await this.todoService.getPendingShareInvites(this.parentRef.user.id);
      this.pendingShareInvites = invites ?? [];
      this.showShareInvitePrompt = this.pendingShareInvites.length > 0;
    } catch (err) {
      console.error('Failed to load pending share invites', err);
    }
  }

  async acceptShareInvite(inviteId: number) {
    if (!this.parentRef?.user?.id) return;
    const invite = this.pendingShareInvites.find(i => i.inviteId === inviteId);
    try {
      const result = await this.todoService.acceptShareInvite(inviteId, this.parentRef.user.id);
      this.parentRef?.showNotification(result ?? 'Invite accepted');
      
      // Activate the shared column and switch to it
      if (invite) {
        await this.todoService.subscribeToColumn(invite.todoColumnId, this.parentRef.user.id);
        if (!this.todoTypes.includes(invite.columnName)) {
          this.todoTypes.push(invite.columnName);
        }
        // Switch to the accepted column
        if (this.selectedType?.nativeElement) {
          this.selectedType.nativeElement.value = invite.columnName;
          await this.getTodoInfo();
        }
      }
      
      this.pendingShareInvites = this.pendingShareInvites.filter(i => i.inviteId !== inviteId);
      this.showShareInvitePrompt = this.pendingShareInvites.length > 0;
    } catch (err) {
      console.error('Failed to accept share invite', err);
      this.parentRef?.showNotification('Failed to accept invite');
    }
  }

  async declineShareInvite(inviteId: number) {
    if (!this.parentRef?.user?.id) return;
    try {
      const result = await this.todoService.declineShareInvite(inviteId, this.parentRef.user.id);
      this.parentRef?.showNotification(result ?? 'Invite declined');
      this.pendingShareInvites = this.pendingShareInvites.filter(i => i.inviteId !== inviteId);
      this.showShareInvitePrompt = this.pendingShareInvites.length > 0;
    } catch (err) {
      console.error('Failed to decline share invite', err);
      this.parentRef?.showNotification('Failed to decline invite');
    }
  }
  ngOnDestroy() {
    this.stopSharedPolling();
  }

  private startSharedPolling() {
    this.stopSharedPolling();
    const type = this.selectedType?.nativeElement.value || this.todoTypes[0];
    const isShared = this.getIsShared(type);
    if (isShared) {
      this.resyncCountdown = Math.floor(this.sharedPollIntervalMs / 1000);
      this.sharedPollTimer = setInterval(async () => {
        if (!this.parentRef?.user?.id) return;
        await this.getTodoInfo();
      }, this.sharedPollIntervalMs);
      this.ensureResyncTicking();
    } else {
      this.resyncCountdown = 0;
    }
  }

  private getIsShared(type: string) {
    return this.sharedColumns.some(sc => {
      const colName = sc.columnName ?? sc.column_name ?? sc.ColumnName;
      const sharedWith = sc.sharedWith ?? sc.SharedWith ?? sc.shared_with ?? '';
      return colName === type && sharedWith && sharedWith.toString().trim() !== '';
    });
  }

  async openManageInline(item: any) {
    if (!item || !item.ownerColumnId) return;
    // toggle close if already open
    if (this.managingColumnId === item.ownerColumnId) { this.managingColumnId = undefined; return; }
    this.managingColumnId = item.ownerColumnId;
    this.startLoading();
    try {
      const res = await this.todoService.getColumnActivations(item.ownerColumnId);
      this.columnActivations[item.ownerColumnId] = res ?? [];
    } catch (err) {
      console.error('Failed to load activations', err);
      this.columnActivations[item.ownerColumnId] = [];
    }
    this.stopLoading();
  }

  async removeSharedUser(ownerId: number, ownerColumnId: number, userIdToRemove: number) {
    if (!this.parentRef?.user?.id) return;
    try {
      const result = await this.todoService.unshareWith(ownerId, userIdToRemove, this.sharedColumns.find(c => c.OwnerColumnId === ownerColumnId || c.ownerColumnId === ownerColumnId)?.columnName ?? '');
      if (result) {
        this.parentRef?.showNotification(result);
        // refresh activations and sharedColumns
        const res = await this.todoService.getColumnActivations(ownerColumnId);
        this.columnActivations[ownerColumnId] = res ?? [];
        await this.todoService.getSharedColumns(this.parentRef.user.id).then(r => {
          if (r) { this.sharedColumns = (r as any[]).map((r2: any) => ({ ownerId: r2.ownerId ?? r2.OwnerId, columnName: r2.columnName ?? r2.ColumnName, sharedWith: r2.sharedWith ?? r2.SharedWith ?? '', ownerName: r2.ownerName ?? r2.OwnerName ?? '', shareDirection: r2.shareDirection ?? r2.ShareDirection ?? '', ownerColumnId: r2.ownerColumnId ?? r2.OwnerColumnId })) }
        });
      }
    } catch (err) {
      console.error('Failed to remove shared user', err);
    }
  }

  private stopSharedPolling() {
    if (this.sharedPollTimer) {
      clearInterval(this.sharedPollTimer);
      this.sharedPollTimer = null;
    }
    if (this.resyncTickTimer) {
      clearInterval(this.resyncTickTimer);
      this.resyncTickTimer = null;
    }
    this.resyncCountdown = 0;
  }

  private pauseSharedPollingForEdit() {
    if (this.sharedPollTimer) {
      this.wasSharedPollingActiveBeforeEdit = true;
      this.stopSharedPolling();
    } else {
      this.wasSharedPollingActiveBeforeEdit = false;
    }
  }

  private resumeSharedPollingIfNeeded() {
    if ((this.isEditing?.length ?? 0) > 0) return;
    if (this.wasSharedPollingActiveBeforeEdit) {
      this.startSharedPolling();
      this.wasSharedPollingActiveBeforeEdit = false;
    }
  }
  ngAfterViewInit() {
    this.setTodoDropdownPlaceholder();
  }
  clearInputs() {
    if (this.todoInput?.nativeElement) { this.todoInput.nativeElement.value = ""; }
    // urlInput lives inside the composer popup, so it only exists while the
    // popup is open — guard instead of assuming both are rendered.
    if (this.urlInput?.nativeElement) { this.urlInput.nativeElement.value = ""; }
  }
  async typeOnChange() {
    this.ngOnInit();
    this.setTodoDropdownPlaceholder();
  }

  async getTodoInfo() {
    if (!this.parentRef?.user?.id) return;
    // Never clobber the list (or touch the loading state) while an edit popup is
    // open — an in-flight poll must not flash Loading or block the editor.
    if (this.isEditing?.length) return;
    try {
      this.startLoading();
      const terms = this.searchInput ? this.searchInput.nativeElement.value : "";
      const search = (!terms || terms.trim() == "") ? undefined : terms;
      const type = this.selectedType?.nativeElement.value || this.todoTypes[0];
      const res = await this.todoService.getTodo(this.parentRef.user.id, type, search);
      this.todos = res;
      this.todoCount = this.todos?.length;
      this.stopLoading();
      this.startSharedPolling();
    } catch (error) {
      console.error("Error fetching calendar entries:", error);
      this.stopLoading();
    }
  }
  async addTodo() {
    if (!this.parentRef?.user?.id) return;

    if (!this.todoInput.nativeElement.value) {
      return alert("Cannot add empty values.");
    }
    this.startLoading();
    let tmpTodo = new Todo();
    tmpTodo.date = new Date();
    tmpTodo.type = this.selectedType.nativeElement.value;
    tmpTodo.url = this.urlInput?.nativeElement?.value ?? "";
    tmpTodo.todo = this.todoInput.nativeElement.value;
    tmpTodo.fileId = this.selectedFile?.id;

    const resTodo = await this.todoService.createTodo(this.parentRef.user.id, tmpTodo);
    if (resTodo) {
      const todoId = parseInt(resTodo, 10);
      this.userEventService.insertUserEvent(
        this.parentRef.user.id,
        'todo_added',
        'Added a Todo!',
        Number.isNaN(todoId) ? undefined : todoId,
        'todo'
      );
    }
    this.clearInputs();
    this.mediaSelector?.removeAllFiles();
    this.selectedFile = undefined;
    // The composer popup served its purpose — collapse it back down.
    this.isAddTodoPopupOpen = false;

    // If we're currently viewing the main "Todo" list, increment the navigation counter
    try {
      const currentType = this.selectedType?.nativeElement?.value || this.todoTypes[0];
      if (currentType === 'Todo' && this.parentRef?.navigationItems) {
        const todoNav = this.parentRef.navigationItems.find((x: any) => x.title === 'Todo');
        if (todoNav) {
          // Get the current count from the server to avoid race conditions
          const res: any = await this.todoService.getTodoCount(this.parentRef.user.id, 'Todo');
          const currentCount = res?.count ?? 0;
          todoNav.content = currentCount > 0 ? currentCount.toString() : '';
        }
      }
    } catch (e) {
      console.error('Failed to update nav todo count after add', e);
    }

    this.ngOnInit();
    this.stopLoading();
  }
  async deleteTodo(id: number) {
    if (!this.parentRef?.user?.id) return;
    this.startLoading();
    await this.todoService.deleteTodo(this.parentRef.user.id, id);
    const tmpTodo = this.todos.filter(x => x.id == id)[0];
    if (tmpTodo) {
      tmpTodo.deleted = true;
    }
    await this.closeEditPopup(false);
    // If we're currently viewing the main "Todo" list, decrement the navigation counter
    try {
      const currentType = this.selectedType?.nativeElement?.value || this.todoTypes[0];
      if (currentType === 'Todo' && this.parentRef?.navigationItems) {
        const todoNav = this.parentRef.navigationItems.find((x: any) => x.title === 'Todo');
        if (todoNav) {
          // Get the current count from the server to avoid race conditions
          const res: any = await this.todoService.getTodoCount(this.parentRef.user.id, 'Todo');
          const currentCount = res?.count ?? 0;
          todoNav.content = currentCount > 0 ? currentCount.toString() : '';
        }
      }
    } catch (e) {
      console.error('Failed to update nav todo count after delete', e);
    }

    // Insert user event for deleting a todo
    if(this.parentRef?.user?.id && tmpTodo) {
      this.userEventService.insertUserEvent(
      this.parentRef.user.id,
      'todo_deleted',
      `Deleted Todo`,
      id,
      'todo'
      );
    }

    this.todoCount--;
    this.clearInputs();
    this.stopLoading();
  }
  async search() {
    await this.getTodoInfo();
  }
  async clearSearch() {
    if (!this.searchInput) return;
    this.searchInput.nativeElement.value = '';
    await this.getTodoInfo();
  }
  openEditListPanel() { 
    this.isMenuPanelOpen = false; 
    setTimeout(() => {
      this.closeShareListPanel();
      setTimeout(() => {
        this.isEditListPanelOpen = true;
        this.parentRef?.showOverlay();
      }, 50);
    }, 10);

   
  }
  closeEditListPanel() {
    this.isEditListPanelOpen = false;
    this.parentRef?.closeOverlay();
  }
  hideColumn(type: string) {
    if (!this.parentRef?.user?.id) return alert("You must be logged in to edit your todo list.");
    if (!type) { return alert("type cannot be empty"); }
    this.todoService.removeColumn(this.parentRef.user.id, type).then(res => {
      if (res) {
        this.parentRef?.showNotification(res);
        this.todoTypes = this.todoTypes.filter(x => x != type);
        setTimeout(() => {
          if (this.selectedType?.nativeElement) {
            this.selectedType.nativeElement.selectedIndex = 0;
            this.getTodoInfo();
          }
        }, 50);
      }
    });
  }
  async addColumn(column?: string) {
    if (!this.parentRef?.user?.id) return alert("You must be logged in to edit your todo list.");
    const type = column ?? this.addNewColumnInput.nativeElement.value;
    if (type) {
      await this.todoService.addColumn(this.parentRef.user.id, type).then(res => {
        if (res) {
          this.parentRef?.showNotification(res);
          this.todoTypes.push(type);
          if (this.addNewColumnInput && this.addNewColumnInput.nativeElement) {
            this.addNewColumnInput.nativeElement.value = "";
          }
        }
      });
    }
  }
  showColumn(type: string) {
    if (!this.parentRef?.user?.id) return alert("You must be logged in to edit your todo list.");
    this.todoService.addColumn(this.parentRef.user.id, type).then(res => {
      if (res) {
        this.parentRef?.showNotification(res);
      }
    });
  }
  private setTodoDropdownPlaceholder() {
    setTimeout(() => {
      const typeValue = this.selectedType?.nativeElement?.value || '';
      this.todoPlaceholder = `Add to the ${typeValue} list`;
    });
  }
  selectFile(selectedFile: FileEntry[]) {
    this.selectedFile = selectedFile[0];
  }
  visitUrl(url: string) {
    if (!url || url === 'undefined') return;
    this.parentRef?.visitExternalLink(url);
  }
  openShareListPanel() {
    this.isMenuPanelOpen = false;
    this.parentRef?.closeOverlay();
    setTimeout(() => { 
      this.isShareListPanelOpen = true;
      this.parentRef?.showOverlay();
    }, 10);
  }
  closeShareListPanel() {
    this.isShareListPanelOpen = false;
    this.parentRef?.closeOverlay();
  }
  shareWith(user?: User) {
    if (!this.parentRef?.user?.id || !user?.id) { return alert("You must be logged in to share a list."); }
    this.todoService.shareListWith(this.parentRef.user.id, user.id, this.selectedType.nativeElement.value).then(res => {
      if (res) {
        this.parentRef?.showNotification(res);
        if (res.includes("successfully")) {
          if (this.sharedColumns.some((x: any) => x.columnName == this.selectedType.nativeElement.value && x.ownerId == this.parentRef?.user?.id)) {
            const index = this.sharedColumns.findIndex((x: any) => x.columnName == this.selectedType.nativeElement.value && x.ownerId == this.parentRef?.user?.id);
            this.sharedColumns[index].sharedWith += ", " + user.id;
          } else {
            this.sharedColumns.push(
              {
                ownerId: this.parentRef?.user?.id,
                columnName: this.selectedType.nativeElement.value,
                ownerName: this.parentRef?.user?.username,
                sharedWith: user.id + '',
                shareDirection: 'shared_by_me'
              });
          }
        }
      }
    });
  }
  async unshare(column: string, userId?: number): Promise<void> {
    if (!this.parentRef?.user?.id) {
      alert("You must be logged in to unshare");
      return;
    }

    if (!userId) {
      alert("Please specify a user to unshare with");
      return;
    }

    try {
      const result = await this.todoService.unshareWith(
        this.parentRef.user.id,
        userId,
        column
      );

      if (result?.includes("successfully")) {
        this.parentRef.showNotification(result);
        // More precise filtering that won't match partial IDs
        this.sharedColumns = this.sharedColumns.map(col => {
          if (col.columnName === column && col.sharedWith) {
            return {
              ...col,
              sharedWith: col.sharedWith.split(',')
                .map((id: string) => id.trim())
                .filter((id: string) => id !== userId.toString())
                .join(', ')
            };
          }
          return col;
        }).filter(col =>
          col.columnName !== column ||
          (col.sharedWith && col.sharedWith.trim() !== '')
        );
      }
    } catch (error) {
      console.error("Failed to unshare:", error);
      this.parentRef?.showNotification("Failed to unshare list");
    }
  }

  async leaveSharedColumn(column: string, ownerId?: number, ownerColumnId?: number): Promise<void> {
    if (!this.parentRef?.user?.id) {
      alert("You must be logged in to leave a shared column");
      return;
    }

    if (!ownerColumnId) {
      alert("Invalid column");
      return;
    }

    try {
      const result = await this.todoService.unsubscribeFromColumn(ownerColumnId, this.parentRef.user.id);

      if (result) {
        this.parentRef.showNotification(result);
        this.sharedColumns = this.sharedColumns.filter(col =>
          !(col.columnName === column && col.ownerId === ownerId)
        );
        this.todoTypes = this.todoTypes.filter(t => t !== column);
      }
    } catch (error) {
      console.error("Failed to leave shared column:", error);
      this.parentRef?.showNotification("Failed to leave shared column");
    }
  }
  parseInteger(any: any) {
    return parseInt(any);
  }
  getSharedWithYou() {
    return this.sharedColumns.filter(column => {
      return column.shareDirection == "shared_with_me" && column.ownerId != this.parentRef?.user?.id;
    });
  }
  getSharedUsers() {
    return this.sharedColumns.filter(x => x.shareDirection == "shared_by_me" && x.ownerId == this.parentRef?.user?.id);
  }

  // Return an activations array for the provided sharedColumn item in a safe way
  getColumnActivationsFor(item: any): Array<{ userId: number, username?: string, activated?: boolean }> {
    if (!item) return [];
    const id = item.ownerColumnId ?? item.OwnerColumnId ?? item.ownerId ?? item.OwnerId;
    if (!id) return [];
    return this.columnActivations[id] ?? [];
  }

  currentUserColumns: string[] = []; // List of column names the user has added

  isColumnAdded(columnName: string): boolean {
    return this.todoTypes.includes(columnName);
  }

  toggleSharedColumn(column: any): void {
    if (!column) return;
    if (this.todoTypes.includes(column.columnName)) {
      // Remove column logic
      this.removeColumn(column.columnName);
    } else {
      // Add column logic
      this.addSharedColumn(column);
    }
  }

  async addSharedColumn(column: any) {
    // Call your API to add the column to user's list
    // Then update currentUserColumns   
    if (!this.parentRef?.user?.id) return;
    try {
      const res = await this.todoService.subscribeToColumn(column.ownerColumnId ?? column.OwnerColumnId, this.parentRef.user.id);
      if (res) {
        this.parentRef?.showNotification(res);
        // Add the column name locally so the UI shows it
        if (!this.todoTypes.includes(column.columnName)) {
          this.todoTypes.push(column.columnName);
        }
      }
    } catch (err) {
      console.error('Failed to subscribe to column', err);
    }
  }

  async removeColumn(columnName: string): Promise<void> {
    // If this column is a shared column owned by someone else, unsubscribe (leave shared column)
    if (!this.parentRef?.user?.id) {
      alert("You must be logged in to remove a column");
      return;
    }

    // Find a shared column entry where the owner is not the current user
    const currentUserId = this.parentRef?.user?.id ?? 0;
    const shared = this.sharedColumns.find((c: any) => c.columnName === columnName && c.ownerId && c.ownerId !== currentUserId);
    if (shared) {
      try {
        const ownerColumnId = shared.ownerColumnId ?? shared.OwnerColumnId ?? shared.OwnerColumnId;
        const res = await this.todoService.unsubscribeFromColumn(ownerColumnId, this.parentRef.user.id);
        if (res) {
          this.parentRef?.showNotification(res);
          // Remove the column from local UI lists
          this.todoTypes = this.todoTypes.filter(x => x !== columnName);
          this.sharedColumns = this.sharedColumns.filter((c: any) => !(c.columnName === columnName && c.ownerId === shared.ownerId));
        }
      } catch (err) {
        console.error('Failed to unsubscribe from shared column', err);
        this.parentRef?.showNotification('Failed to unsubscribe from shared column');
      }
      return;
    }

    // Otherwise, remove user's own column
    this.hideColumn(columnName);
  }

  openSharePanel(column: any): void {
    this.selectedType.nativeElement.value = column.columnName;
    this.isShareListPanelOpen = true;
  }
  async editTodo(todo?: Todo) {
    if (!todo || !todo.id) return;
    this.hasEditedTodo = false;
    const id = todo.id;
    if (!this.isEditing.find(x => x.id == todo.id)) {
      this.parentRef?.showOverlay();
      this.isEditing.push(todo);
      this.pauseSharedPollingForEdit();
      setTimeout(() => {
        // Grow every open edit textarea to fit its pre-filled text once the
        // popups render (ids repeat per row, so a global id lookup could hit
        // the wrong one when several rows are being edited at once).
        document.querySelectorAll('#todoEditingTextarea').forEach(ta => this.autoGrowTextarea(ta as HTMLTextAreaElement));
        if (todo.fileId) {
          const fileEntry = { id: todo.fileId } as FileEntry;
          this.todoEditingFile.selectFile(fileEntry);
          this.todoEditingFile.viewMediaChoicesOpen = false;
        }
      }, 50);
      return;
    } else {
      const text = (document.getElementById("todoEditingTextarea") as HTMLTextAreaElement).value.trim();
      const urlRaw = (document.getElementById('todoEditingUrlTextarea') as HTMLTextAreaElement).value.trim();
      // Older todos have their URL stored as the literal string "undefined"
      // (an Angular [value]="item.url" coercion bug when the URL was empty) —
      // treat it as no URL so saving cleans the row instead of re-persisting it.
      const url = urlRaw === 'undefined' ? '' : urlRaw;
      const fileId = this.todoEditingFile.selectedFiles[0]?.id ?? undefined;
      this.isEditing = this.isEditing.filter(x => x.id !== id);
      const original = {
        todo: this.todos.find(t => t.id === id)?.todo,
        url: this.todos.find(t => t.id === id)?.url,
        fileId: this.todos.find(t => t.id === id)?.fileId,
      };
      // Preempt the edit: apply it locally right away so no loading state is needed.
      const todo = this.todos.find(t => t.id === id);
      if (todo) {
        todo.todo = text;
        todo.url = url;
        todo.fileId = fileId;
      }
      // The service never throws (returns null on failure), so no try/catch needed.
      const res = await this.todoService.editTodo(id, text, url, fileId);
      if (res) {
        // Sanitize the optimistic edit with the server's canonical stored values
        // (e.g. an emptied URL or removed file becomes null/undefined in the UI,
        // matching what the server actually persisted).
        const saved = this.todos.find(t => t.id === id);
        if (saved) {
          if (typeof res.content === 'string') saved.todo = res.content;
          saved.url = res.url ?? undefined;
          saved.fileId = res.fileId ?? undefined;
        }
        this.parentRef?.showNotification('Todo updated');
        this.parentRef?.closeOverlay(false);
        this.isExpandedEditFile = false;
      } else {
        // Server rejected the edit (negative result) — roll the optimistic change back
        // and keep the panel context so the failure is visible.
        this.rollbackTodoEdit(id, original);
        this.parentRef?.showNotification("Failed to update todo");
      }
      this.resumeSharedPollingIfNeeded();
    }
  }
  private rollbackTodoEdit(id: number, original: { todo?: string; url?: string; fileId?: number }) {
    // Re-find by id so a refetch/reorder during the request can't hit the wrong row.
    const todo = this.todos.find(t => t.id === id);
    if (todo) {
      todo.todo = original.todo;
      todo.url = original.url;
      todo.fileId = original.fileId;
    }
  }
  async closeEditPopup(shouldEdit = true) {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      // No loading: editTodo applies the change optimistically and rolls it
      // back only if the server returns a negative result.
      if (this.hasEditedTodo && shouldEdit) {
        await this.editTodo(this.isEditing[0]);
      } else {
        this.isEditing = [];
        this.resumeSharedPollingIfNeeded();
      }

      if (this.parentRef) {
        this.parentRef.closeOverlay(false);
      }
    }, 50);
  }
  expandedEditFile(value: boolean) {
    console.log("expandedEditFile", value);
    this.isExpandedEditFile = value;
  }
  openMenuPanel() {
    this.isMenuPanelOpen = true;
    this.parentRef?.showOverlay();
  }
  closeMenuPanel() {
    this.isMenuPanelOpen = false;
    this.parentRef?.closeOverlay();
  }

  /** Opens the add-todo composer popup and focuses the text input. */
  openAddTodoPopup() {
    if (this.isAddTodoPopupOpen) {
      // Already open — just make sure the text input has focus.
      setTimeout(() => this.todoInput?.nativeElement?.focus());
      return;
    }
    this.isAddTodoPopupOpen = true;
    this.parentRef?.showOverlay();
    setTimeout(() => this.todoInput?.nativeElement?.focus());
  }
  closeAddTodoPopup() {
    this.isAddTodoPopupOpen = false;
    this.parentRef?.closeOverlay();
  }

  // Export currently loaded todos to a plain-text .txt file
  exportTodosAsTxt() {
    try {
      const items = (this.todos ?? []).filter(t => !t.deleted);
      if (!items || items.length === 0) {
        this.parentRef?.showNotification?.('No todos to export');
        return;
      }

      const lines: string[] = items.map(t => {
        const dateStr = t.date ? (t.date instanceof Date ? t.date.toISOString() : new Date(t.date).toISOString()) : '';
        const parts = [] as string[];
        parts.push(`Date: ${dateStr}`);
        if (t.type) parts.push(`Type: ${t.type}`);
        parts.push(`Todo: ${t.todo ?? ''}`);
        if (t.url) parts.push(`URL: ${t.url}`);
        if (t.fileId) parts.push(`FileId: ${t.fileId}`);
        return parts.join('\n');
      });

      const content = lines.join('\n\n----------------------------------------\n\n');
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `todos-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      console.error('Failed to export todos', err);
      this.parentRef?.showNotification?.('Failed to export todos');
    }
  }

  // Export all todos visible to the user by calling the server-side GetAll endpoint
  async exportAllTodosAsTxt() {
    try {
      if (!this.parentRef?.user?.id) {
        this.parentRef?.showNotification?.('You must be logged in to export all todos');
        return;
      }

      this.startLoading();
      const res = await this.todoService.getAllTodo(this.parentRef.user.id);
      this.stopLoading();

      if (!res || !Array.isArray(res) || res.length === 0) {
        this.parentRef?.showNotification?.('No todos returned from server');
        return;
      }

      const items = (res as any[]).filter(t => !t.deleted);
      const lines: string[] = items.map(t => {
        const dateStr = t.date ? (t.date instanceof Date ? t.date.toISOString() : new Date(t.date).toISOString()) : '';
        const parts = [] as string[];
        parts.push(`Date: ${dateStr}`);
        if (t.type) parts.push(`Type: ${t.type}`);
        if (t.owner_name) parts.push(`Owner: ${t.owner_name}`);
        parts.push(`Todo: ${t.todo ?? ''}`);
        if (t.url) parts.push(`URL: ${t.url}`);
        if (t.fileId || t.file_id) parts.push(`FileId: ${t.fileId ?? t.file_id}`);
        return parts.join('\n');
      });

      const content = lines.join('\n\n----------------------------------------\n\n');
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `todos-all-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      console.error('Failed to export all todos', err);
      this.parentRef?.showNotification?.('Failed to export all todos');
      this.stopLoading();
    }
  }
  // Ensure per-second countdown ticking
  private ensureResyncTicking() {
    if (this.resyncTickTimer) return; // already ticking
    this.resyncTickTimer = setInterval(() => {
      if (this.resyncCountdown > 0) {
        this.resyncCountdown--;
      } else {
        // Stop ticking if countdown finished and will be reset by sharedPollTimer
        if (this.resyncTickTimer) {
          clearInterval(this.resyncTickTimer);
          this.resyncTickTimer = null;
        }
      }
    }, 1000);
  }
}
