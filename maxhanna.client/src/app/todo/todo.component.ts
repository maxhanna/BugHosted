import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
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
export class TodoComponent extends ChildComponent implements OnInit {
  todos: Array<Todo> = [];
  todoTypes: string[] = ['Todo', 'Work', 'Shopping', 'Study', 'Movie', 'Bucket', 'Recipe', "Wife"];
  todoCount = 0;
  isEditListPanelOpen = false;
  userColumns: string[] = [];

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
    if (this.parentRef?.user) {
      await this.todoService.getColumnsForUser(this.parentRef.user).then(res => {
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
  clearInputs() {
    if (!(this.urlInput && this.todoInput)) { return; }
    this.urlInput.nativeElement.value = "";
    this.todoInput.nativeElement.value = "";
  }
  async typeOnChange() {
    this.ngOnInit();
  }
  async getTodoInfo() {
    try {
      const terms = this.searchInput ? this.searchInput.nativeElement.value : "";
      const search = (!terms || terms.trim() == "") ? undefined : terms;

      const type = this.selectedType?.nativeElement.value || this.todoTypes[0];
      const res = await this.todoService.getTodo(this.parentRef?.user!, type, search);
      this.todos = res;
      this.todoCount = this.todos?.length; 
    } catch (error) {
      console.error("Error fetching calendar entries:", error);
    }
  }
  async addTodo() {
    if (!this.todoInput.nativeElement.value) {
      return alert("Cannot add empty values.");
    }
    let tmpTodo = new Todo();
    tmpTodo.date = new Date();
    tmpTodo.type = this.selectedType.nativeElement.value;
    tmpTodo.url = this.urlInput.nativeElement.value;
    tmpTodo.todo = this.todoInput.nativeElement.value; 

    await this.todoService.createTodo(this.parentRef?.user!, tmpTodo);
    this.ngOnInit();
  }
  async deleteTodo(id: number) {
    await this.todoService.deleteTodo(this.parentRef?.user!, id);
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
    if (!this.parentRef?.user) return alert("You must be logged in to edit your todo list.");
    this.todoService.removeColumn(this.parentRef.user, type).then(res => {
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
    if (!this.parentRef?.user) return alert("You must be logged in to edit your todo list.");
    const type = this.addNewColumnInput.nativeElement.value; 
    if (type) {
      this.todoService.addColumn(this.parentRef.user, type).then(res => {
        if (res) {
          this.parentRef?.showNotification(res);
          this.todoTypes.push(type);
        }
      });
    } 
  }
  showColumn(type: string) {
    if (!this.parentRef?.user) return alert("You must be logged in to edit your todo list.");
    this.todoService.addColumn(this.parentRef.user, type).then(res => {
      if (res) {
        this.parentRef?.showNotification(res);
      }
    });
  }
}
