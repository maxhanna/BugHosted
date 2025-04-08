import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { lastValueFrom } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Todo } from '../../services/datacontracts/todo';
import { TodoService } from '../../services/todo.service';

@Component({
  selector: 'app-todo',
  templateUrl: './todo.component.html',
  styleUrl: './todo.component.css',
  standalone: false
})
export class TodoComponent extends ChildComponent implements OnInit, AfterViewInit {
  todos: Array<Todo> = [];
  todoTypes: string[] = ['Todo', 'Work', 'Shopping', 'Study', 'Movie', 'Bucket', 'Recipe', "Wife"];
  todoCount = 0;
  isEditListPanelOpen = false;
  userColumns: string[] = [];
  todoPlaceholder = "";

  @ViewChild('todoInput') todoInput!: ElementRef<HTMLInputElement>;
  @ViewChild('urlInput') urlInput!: ElementRef<HTMLInputElement>;
  @ViewChild('selectedType') selectedType!: ElementRef<HTMLSelectElement>;
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;
  @ViewChild('addNewColumnInput') addNewColumnInput!: ElementRef<HTMLInputElement>;

  constructor(private todoService: TodoService) {
    super();
  }
  async ngOnInit() {
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
          this.todoTypes = this.todoTypes.filter(type => userColumnNames.includes(type));
        }
      });
    }

    this.clearInputs();
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
      const terms = this.searchInput ? this.searchInput.nativeElement.value : "";
      const search = (!terms || terms.trim() == "") ? undefined : terms;

      const type = this.selectedType?.nativeElement.value || this.todoTypes[0];
      const res = await this.todoService.getTodo(this.parentRef.user.id, type, search);
      this.todos = res;
      this.todoCount = this.todos?.length;
    } catch (error) {
      console.error("Error fetching calendar entries:", error);
    }
  }
  async addTodo() {
    if (!this.parentRef?.user?.id) return;

    if (!this.todoInput.nativeElement.value) {
      return alert("Cannot add empty values.");
    }
    let tmpTodo = new Todo();
    tmpTodo.date = new Date();
    tmpTodo.type = this.selectedType.nativeElement.value;
    tmpTodo.url = this.urlInput.nativeElement.value;
    tmpTodo.todo = this.todoInput.nativeElement.value;

    await this.todoService.createTodo(this.parentRef.user.id, tmpTodo);
    this.ngOnInit();
  }
  async deleteTodo(id: number) {
    if (!this.parentRef?.user?.id) return;

    await this.todoService.deleteTodo(this.parentRef.user.id, id);
    if (document.getElementById("todoNo" + id)) {
      document.getElementById("todoNo" + id)!.style.textDecoration = "line-through";
      document.getElementById("todoDeleteNo" + id)?.setAttribute("disabled", "true");
    }
    this.todoCount--;
    this.clearInputs();
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
  addColumn() {
    if (!this.parentRef?.user?.id) return alert("You must be logged in to edit your todo list.");
    const type = this.addNewColumnInput.nativeElement.value;
    if (type) {
      this.todoService.addColumn(this.parentRef.user.id, type).then(res => {
        if (res) {
          this.parentRef?.showNotification(res);
          this.todoTypes.push(type);
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
}
