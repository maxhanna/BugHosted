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
  todoTypes: string[] = ['Todo', 'Work', 'Shopping', 'Study', 'Movie', 'Bucket', 'Recipe'];
  defaultTodoTypes: string[] = ['Todo', 'Work', 'Shopping', 'Study', 'Movie', 'Bucket', 'Recipe'];
  todoCount = 0;
  isEditListPanelOpen = false;
  isShareListPanelOpen = false;
  userColumns: string[] = [];
  todoPlaceholder = "";
  selectedFile?: FileEntry;
  showSharedList = false;

  @ViewChild('todoInput') todoInput!: ElementRef<HTMLInputElement>;
  @ViewChild('urlInput') urlInput!: ElementRef<HTMLInputElement>;
  @ViewChild('selectedType') selectedType!: ElementRef<HTMLSelectElement>;
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;
  @ViewChild('mediaSelector') mediaSelector!: MediaSelectorComponent;
  @ViewChild('addNewColumnInput') addNewColumnInput!: ElementRef<HTMLInputElement>;

  constructor(private todoService: TodoService) {
    super();
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
          this.sharedColumns = res;
        }
      }); 
    }

    this.clearInputs();
    this.stopLoading();
  }
  ngOnDestroy() {
    this.parentRef?.removeResizeListener();
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
      const terms = this.searchInput ? this.searchInput.nativeElement.value : "";
      const search = (!terms || terms.trim() == "") ? undefined : terms;

      const type = this.selectedType?.nativeElement.value || this.todoTypes[0];
      const res = await this.todoService.getTodo(this.parentRef.user.id, type, search);
      this.todos = res;
      this.todoCount = this.todos?.length;
      this.stopLoading();
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
    this.ngOnInit();
    this.stopLoading();
  }
  async deleteTodo(id: number) {
    if (!this.parentRef?.user?.id) return;
    this.startLoading();
    await this.todoService.deleteTodo(this.parentRef.user.id, id);
    if (document.getElementById("todoNo" + id)) {
      document.getElementById("todoNo" + id)!.style.textDecoration = "line-through";
      document.getElementById("todoDeleteNo" + id)?.setAttribute("disabled", "true");
    }
    this.todoCount--;
    this.clearInputs();
    this.stopLoading();
  }
  async search() {
    this.getTodoInfo();
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
    if (this.parentRef?.isYoutubeUrl(url)) {
      const videoId = this.parentRef.getYouTubeVideoId(url);
      if (videoId) {
        this.parentRef.playYoutubeVideo(videoId);
      }
    } else { 
      this.parentRef?.visitExternalLink(url);
    }
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
    console.log(user);
    this.todoService.shareListWith(this.parentRef.user.id, user.id, this.selectedType.nativeElement.value).then(res => {
      if (res) {
        this.parentRef?.showNotification(res);
        if (res.includes("successfully")) {
          if (this.sharedColumns.some((x: any) => x.columnName == this.selectedType.nativeElement.value  && x.ownerId == this.parentRef?.user?.id)) {
            const index = this.sharedColumns.findIndex((x: any) => x.columnName == this.selectedType.nativeElement.value && x.ownerId == this.parentRef?.user?.id);
            console.log("fixing existing sharedColumn: ", this.sharedColumns[index]);
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
                .filter((id:string) => id !== userId.toString())
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
    return this.sharedColumns.filter(x => x.shareDirection == "shared_by_me" &&  x.ownerId == this.parentRef?.user?.id);
  }
 
  currentUserColumns: string[] = []; // List of column names the user has added

  isColumnAdded(columnName: string): boolean {
    return this.todoTypes.includes(columnName);
  }

  toggleSharedColumn(column: any): void {
    console.log(this.todoTypes.includes(column.columnName), column);
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
    await this.addColumn(column.columnName);
  //  await this.shareWith(new User(column.ownerId));
  }

  removeColumn(columnName: string): void {
    // Call your API to remove the column from user's list
    // Then update currentUserColumns 
    this.hideColumn(columnName);
  }

  openSharePanel(column: any): void {
    this.selectedType.nativeElement.value = column.columnName;
    this.isShareListPanelOpen = true;
  }
}
