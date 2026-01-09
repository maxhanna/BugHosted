import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { Todo } from '../../services/datacontracts/todo';
import { TodoService } from '../../services/todo.service';
import { MediaSelectorComponent } from '../media-selector/media-selector.component';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { User } from '../../services/datacontracts/user/user';

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
  // Polling for shared columns updates
  private sharedPollIntervalMs = 15000; // 15s
  private sharedPollTimer: any = null;
  // Remember whether shared polling was active before opening an edit session
  private wasSharedPollingActiveBeforeEdit: boolean = false;
  // Countdown (in seconds) until next shared list resynchronisation
  resyncCountdown: number = 0;
  private resyncTickTimer: any = null;

  @ViewChild('todoInput') todoInput!: ElementRef<HTMLInputElement>;
  @ViewChild('urlInput') urlInput!: ElementRef<HTMLInputElement>;
  @ViewChild('selectedType') selectedType!: ElementRef<HTMLSelectElement>;
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;
  @ViewChild('mediaSelector') mediaSelector!: MediaSelectorComponent;
  @ViewChild('todoEditingFile') todoEditingFile!: MediaSelectorComponent;
  @ViewChild('addNewColumnInput') addNewColumnInput!: ElementRef<HTMLInputElement>;

  constructor(private todoService: TodoService) {
    super();
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
  async ngOnInit() {
    this.parentRef?.addResizeListener();
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

    this.clearInputs();
    this.stopLoading();
  }
  ngOnDestroy() {
    this.parentRef?.removeResizeListener();
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
    if (!(this.urlInput && this.todoInput)) { return; }
    this.urlInput.nativeElement.value = "";
    this.todoInput.nativeElement.value = "";
  }
  async typeOnChange() {
    this.ngOnInit();
    this.setTodoDropdownPlaceholder();
  }

  async getTodoInfo() {
    if (!this.parentRef?.user?.id) return;
    try {
      this.startLoading();

      if (!this.isEditing?.length) {
        const terms = this.searchInput ? this.searchInput.nativeElement.value : "";
        const search = (!terms || terms.trim() == "") ? undefined : terms; 
        const type = this.selectedType?.nativeElement.value || this.todoTypes[0];
        const res = await this.todoService.getTodo(this.parentRef.user.id, type, search);
        this.todos = res;
        this.todoCount = this.todos?.length;
        this.stopLoading(); 
        this.startSharedPolling();
      }
      
    } catch (error) {
      console.error("Error fetching calendar entries:", error);
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
    tmpTodo.url = this.urlInput.nativeElement.value;
    tmpTodo.todo = this.todoInput.nativeElement.value;
    tmpTodo.fileId = this.selectedFile?.id;

    await this.todoService.createTodo(this.parentRef.user.id, tmpTodo);

    this.mediaSelector.removeAllFiles();
    this.selectedFile = undefined;

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
    this.isEditListPanelOpen = true;
    this.parentRef?.showOverlay();
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
    this.parentRef?.visitExternalLink(url);
  }
  openShareListPanel() {
    this.isShareListPanelOpen = true;
    this.parentRef?.showOverlay();
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

  async leaveSharedColumn(column: string, ownerId?: number): Promise<void> {
    if (!this.parentRef?.user?.id) {
      alert("You must be logged in to leave a shared column");
      return;
    }

    if (!ownerId) {
      alert("Please specify the list owner");
      return;
    }

    try {
      const result = await this.todoService.leaveSharedColumn(
        this.parentRef.user.id,
        ownerId,
        column
      );

      if (result) {
        this.parentRef.showNotification(result);
        // Remove the column from sharedColumns if leaving was successful
        this.sharedColumns = this.sharedColumns.filter(col =>
          !(col.columnName === column && col.ownerId === ownerId)
        );
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
        if (todo.fileId) {
          const fileEntry = { id: todo.fileId } as FileEntry;
          this.todoEditingFile.selectFile(fileEntry);
          this.todoEditingFile.viewMediaChoicesOpen = false;
        }
      }, 50);
      return;
    } else {
      const todoDiv = document.getElementById('todoNo' + id) as HTMLDivElement;
      const text = (document.getElementById("todoEditingTextarea") as HTMLTextAreaElement).value.trim();
      const url = (document.getElementById('todoEditingUrlTextarea') as HTMLTextAreaElement).value.trim();
      const fileId = this.todoEditingFile.selectedFiles[0]?.id ?? undefined;

      try {
        await this.todoService.editTodo(id, text, url, fileId).then(res => {
          if (res) {
            this.parentRef?.showNotification(res);
            this.parentRef?.closeOverlay(false);
            this.isExpandedEditFile = false;
          }
        });
        const todoIndex = this.todos.findIndex(todo => todo.id === id);
        if (todoIndex !== -1) {
          this.todos[todoIndex].todo = text;
          this.todos[todoIndex].url = url;
          this.todos[todoIndex].fileId = fileId;
        }
        this.isEditing = this.isEditing.filter(x => x.id !== id);
        this.resumeSharedPollingIfNeeded();
      } catch (error) {
        console.error("Error updating todo:", error);
        this.parentRef?.showNotification("Failed to update todo");
      }
    }
  }
  async closeEditPopup(shouldEdit = true) {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      this.startLoading();
      if (this.hasEditedTodo && shouldEdit) { 
        await this.editTodo(this.isEditing[0]);
      } else {
        this.isEditing = [];
        this.resumeSharedPollingIfNeeded();
      }
      
      if (this.parentRef) { 
        this.parentRef.closeOverlay(false);
      }
      this.stopLoading();
    }, 50); 
  }
  expandedEditFile(value : boolean) {
    console.log("expandedEditFile", value);
    this.isExpandedEditFile = value;
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
