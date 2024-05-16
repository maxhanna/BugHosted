// user.service.ts
import { Injectable } from '@angular/core';
import { User } from './datacontracts/user';
import { Todo } from './datacontracts/todo';

@Injectable({
  providedIn: 'root'
})
export class TodoService { 
  async getTodo(user: User, type: string, search?: string) {
    try {
      var params = new URLSearchParams({ type: type });
      if (search) {
        params.set("search", search);
      }

      const response = await fetch('/todo?' + params, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      });

      return await response.json();
    } catch (error) {
      return null; 
    } 
  }
  async createTodo(user: User, todo: Todo) {
    try {
      const response = await fetch('/todo/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user: user, todo: todo }),
      });

      return await response.json();
    } catch (error) {
      return null;
    } 
  }
  async deleteTodo(user: User, id: number) {
    try {
      console.log("in delete todo , user : " + user.username);
      const response = await fetch(`/todo/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
}
