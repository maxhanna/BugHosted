// user.service.ts
import { Injectable } from '@angular/core';
import { Todo } from './datacontracts/todo';
import { User } from './datacontracts/user/user';

@Injectable({
  providedIn: 'root'
})
export class TodoService {
  async getTodo(user: User, type: string, search?: string) {
    if (!user || user.id == 0) return;
    try {
      let params = new URLSearchParams({ type: type });
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

      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async deleteTodo(user: User, id: number) {
    try {
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

  async addColumn(user: User, column: string) {
    try {
      const response = await fetch(`/todo/columns/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ User: user, Column: column }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async removeColumn(user: User, column: string) {
    try {
      const response = await fetch(`/todo/columns/remove`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ User: user, Column: column }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async getColumnsForUser(user: User) {
    try {
      const response = await fetch(`/todo/columns/getcolumnsforuser`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify( user ),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
}
