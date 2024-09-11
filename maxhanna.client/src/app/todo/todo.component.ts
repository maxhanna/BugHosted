import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component'; 
import { lastValueFrom } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Todo } from '../../services/datacontracts/todo';
import { TodoService } from '../../services/todo.service';

@Component({
  selector: 'app-todo',
  templateUrl: './todo.component.html',
  styleUrl: './todo.component.css'
})
export class TodoComponent extends ChildComponent implements OnInit {
  todos: Array<Todo> = [];
  todoTypes: string[] = ['Todo', 'Work', 'Shopping', 'Study', 'Movie', 'Bucket', 'Recipe', "Wife"];

  @ViewChild('todoInput') todoInput!: ElementRef<HTMLInputElement>;
  @ViewChild('urlInput') urlInput!: ElementRef<HTMLInputElement>;
  @ViewChild('selectedType') selectedType!: ElementRef<HTMLSelectElement>;
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  constructor(private todoService: TodoService) {
    super();
  }
  async ngOnInit() {
    await this.getTodoInfo();
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
     
    //const utcDate = new Date(tmpTodo.date.getTime() - (tmpTodo.date.getTimezoneOffset() * 60000));
    //const body = JSON.stringify({ ...tmpTodo, date: utcDate });

    await this.todoService.createTodo(this.parentRef?.user!, tmpTodo);
    this.ngOnInit();
  }
  async deleteTodo(id: number) {
    await this.todoService.deleteTodo(this.parentRef?.user!, id);
    if (document.getElementById("todoNo" + id)) {
      document.getElementById("todoNo" + id)!.style.textDecoration = "line-through";
      document.getElementById("todoDeleteNo" + id)?.setAttribute("disabled", "true");
    }
    this.clearInputs();
  }
  async search() {
    this.getTodoInfo();
  }
}
