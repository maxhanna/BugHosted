import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { Todo } from '../todo';
import { lastValueFrom } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';

@Component({
  selector: 'app-todo',
  templateUrl: './todo.component.html',
  styleUrl: './todo.component.css'
})
export class TodoComponent extends ChildComponent implements OnInit {
  todos: Array<Todo> = [];
  todoTypes: string[] = ['Todo', 'Work', 'Shopping', 'Study', 'Movie', 'Bucket', 'Recipe'];

  @ViewChild('todoInput') todoInput!: ElementRef<HTMLInputElement>;
  @ViewChild('urlInput') urlInput!: ElementRef<HTMLInputElement>;
  @ViewChild('selectedType') selectedType!: ElementRef<HTMLSelectElement>;

  constructor(private http: HttpClient) {
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
      const type = this.selectedType?.nativeElement.value || this.todoTypes[0];
      const params = new HttpParams().set('type', type);
      await this.promiseWrapper(lastValueFrom(this.http.get<Array<Todo>>("/todo", {params}))).then(res => this.todos = res);
    } catch (error) {
      console.error("Error fetching calendar entries:", error);
    }
  }
  async addTodo() {
    let tmpTodo = new Todo();
    tmpTodo.date = new Date();
    tmpTodo.type = this.selectedType.nativeElement.value;
    tmpTodo.url = this.urlInput.nativeElement.value;
    tmpTodo.todo = this.todoInput.nativeElement.value;

    const headers = { 'Content-Type': 'application/json' };
    const utcDate = new Date(tmpTodo.date.getTime() - (tmpTodo.date.getTimezoneOffset() * 60000));
    const body = JSON.stringify({ ...tmpTodo, date: utcDate });

    await this.promiseWrapper(lastValueFrom(this.http.post(`/todo/`, body, { headers })));
    this.ngOnInit();
  }
  async deleteTodo(id: number) {
    await this.promiseWrapper(lastValueFrom(this.http.delete(`/todo/${id}`)));
    if (document.getElementById("todoNo" + id)) {
      document.getElementById("todoNo" + id)!.style.textDecoration = "line-through";
      document.getElementById("todoDeleteNo" + id)?.setAttribute("disabled", "true");
    }
    this.clearInputs();
  }
}
