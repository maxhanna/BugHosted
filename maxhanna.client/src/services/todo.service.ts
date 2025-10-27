// user.service.ts
import { Injectable } from '@angular/core';
import { Todo } from './datacontracts/todo';
import { User } from './datacontracts/user/user';

@Injectable({
  providedIn: 'root'
})
export class TodoService {
  async getTodo(userId: number, type: string, search?: string) {
    if (!userId) return;
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
        body: JSON.stringify(userId),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async getTodayMusic() {
    try {
      const response = await fetch('/todo/todaymusic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async getTodoCount(userId: number, type: string, search?: string) {
    if (!userId) return;
    try {
      let params = new URLSearchParams({ type: type });
      if (search) {
        params.set("search", search);
      }
      const response = await fetch('/todo/getcount?' + params, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userId)
      });
      return await response.json(); // expects { count: number }
    } catch (error) {
      return null;
    }
  }
  async createTodo(userId: number, todo: Todo) {
    try {
      const response = await fetch('/todo/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: userId, todo: todo }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async editTodo(id: number, content: string, url?: string, fileId?: number) {
    try {
      const response = await fetch('/todo/edit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: id, content: content, url: url, fileId: fileId }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async shareListWith(userId: number, toUserId: number, todoColumn: string) {
    try {
      const response = await fetch('/todo/sharelistwith', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, ToUserId: toUserId, Column: todoColumn }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async deleteTodo(userId: number, id: number) {
    try {
      const response = await fetch(`/todo/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async addColumn(userId: number, column: string) {
    try {
      const response = await fetch(`/todo/columns/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, Column: column }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async removeColumn(userId: number, column: string) {
    try {
      const response = await fetch(`/todo/columns/remove`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, Column: column }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async getColumnsForUser(userId: number) {
    try {
      const response = await fetch(`/todo/columns/getcolumnsforuser`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async getSharedColumns(userId: number) {
    try {
      const response = await fetch(`/todo/getsharedcolumns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async getColumnActivations(ownerColumnId: number) {
    try {
      const response = await fetch(`/todo/getcolumnactivations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(ownerColumnId),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async unshareWith(userId: number, unshareWithUserId: number, column: string) {
    try {
      const response = await fetch(`/todo/unsharewith`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, ToUserId: unshareWithUserId, Column: column }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async leaveSharedColumn(userId: number, ownerId: number, column: string) {
    try {
      const response = await fetch(`/todo/leavesharedcolumn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, OwnerId: ownerId, ColumnName: column }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
}
